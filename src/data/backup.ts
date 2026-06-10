import { db } from './db'
import type { Week, Day, Exercise, SetLog, Lift, Note, BodyWeightEntry, Settings } from './db'
import { resolveLift } from './liftCatalog'

// ─── Types ───────────────────────────────────────────────────────────────────

interface BackupV2 {
  format: 'barbell-pro'
  version: 2
  exportedAt: number
  data: {
    weeks: Week[]
    days: Day[]
    exercises: Exercise[]
    setLogs: SetLog[]
    lifts: Lift[]
    notes: Note[]
    bodyWeights: BodyWeightEntry[]
    settings: Settings[]
  }
}

// ─── exportBackup ────────────────────────────────────────────────────────────

export async function exportBackup(): Promise<string> {
  const [weeks, days, exercises, setLogs, lifts, notes, bodyWeights, settings] =
    await Promise.all([
      db.weeks.toArray(),
      db.days.toArray(),
      db.exercises.toArray(),
      db.setLogs.toArray(),
      db.lifts.toArray(),
      db.notes.toArray(),
      db.bodyWeights.toArray(),
      db.settings.toArray(),
    ])

  const backup: BackupV2 = {
    format: 'barbell-pro',
    version: 2,
    exportedAt: Date.now(),
    data: { weeks, days, exercises, setLogs, lifts, notes, bodyWeights, settings },
  }
  return JSON.stringify(backup)
}

// ─── detectFormat ────────────────────────────────────────────────────────────

export function detectFormat(json: string): 'v2' | 'legacy' | 'invalid' {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return 'invalid'
  }

  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    (parsed as Record<string, unknown>).format === 'barbell-pro'
  ) {
    return 'v2'
  }

  // Legacy shape: weeks[0].days[0].exercises must be an array
  const p = parsed as Record<string, unknown>
  if (
    Array.isArray(p?.weeks) &&
    Array.isArray((p.weeks as unknown[])[0] &&
      ((p.weeks as unknown[])[0] as Record<string, unknown>).days) &&
    Array.isArray(
      (((p.weeks as unknown[])[0] as Record<string, unknown>).days as unknown[])?.[0] &&
      ((((p.weeks as unknown[])[0] as Record<string, unknown>).days as unknown[])[0] as Record<string, unknown>).exercises
    )
  ) {
    return 'legacy'
  }

  return 'invalid'
}

// ─── importBackup ────────────────────────────────────────────────────────────

export async function importBackup(
  json: string
): Promise<{ weeks: number; days: number; exercises: number; setLogs: number }> {
  // Validate BEFORE any write
  if (detectFormat(json) !== 'v2') {
    throw new Error('importBackup: not a valid barbell-pro v2 backup')
  }

  const backup = JSON.parse(json) as BackupV2

  // Validate that data arrays exist
  const d = backup.data
  if (
    !d ||
    !Array.isArray(d.weeks) ||
    !Array.isArray(d.days) ||
    !Array.isArray(d.exercises) ||
    !Array.isArray(d.setLogs) ||
    !Array.isArray(d.lifts) ||
    !Array.isArray(d.notes) ||
    !Array.isArray(d.bodyWeights) ||
    !Array.isArray(d.settings)
  ) {
    throw new Error('importBackup: backup data is missing required arrays')
  }

  const tables = [
    db.weeks, db.days, db.exercises, db.setLogs,
    db.lifts, db.notes, db.bodyWeights, db.settings,
  ]

  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map(t => t.clear()))
    await Promise.all([
      db.weeks.bulkAdd(d.weeks),
      db.days.bulkAdd(d.days),
      db.exercises.bulkAdd(d.exercises),
      db.setLogs.bulkAdd(d.setLogs),
      db.lifts.bulkAdd(d.lifts),
      db.notes.bulkAdd(d.notes),
      db.bodyWeights.bulkAdd(d.bodyWeights),
      db.settings.bulkAdd(d.settings),
    ])
  })

  return {
    weeks: d.weeks.length,
    days: d.days.length,
    exercises: d.exercises.length,
    setLogs: d.setLogs.length,
  }
}

// ─── migrateLegacy ───────────────────────────────────────────────────────────

interface LegacyExercise {
  id?: string
  name: string
  load: string
  sets: number
  reps: number
  remarks?: string[]
  completed: boolean
}

interface LegacyDay {
  dayName: string
  date?: string
  exercises: LegacyExercise[]
}

interface LegacyWeek {
  id?: string
  label?: string
  days: LegacyDay[]
}

interface LegacyShape {
  weeks: LegacyWeek[]
  currentWeekIndex?: number
}

export async function migrateLegacy(json: string): Promise<void> {
  const parsed = JSON.parse(json) as LegacyShape

  // Collect all unique lift names first, resolve them BEFORE opening the transaction
  const liftNames = new Set<string>()
  for (const week of parsed.weeks) {
    for (const day of week.days) {
      for (const ex of day.exercises) {
        liftNames.add(ex.name)
      }
    }
  }

  // Resolve all lifts before the transaction (resolveLift may write to db.lifts)
  const liftMap = new Map<string, Lift>()
  for (const name of liftNames) {
    const lift = await resolveLift(name)
    liftMap.set(name, lift)
  }

  // Build all records in memory
  const newWeeks: Week[] = []
  const newDays: Day[] = []
  const newExercises: Exercise[] = []
  const newSetLogs: SetLog[] = []

  let weekOrder = 0
  for (const legacyWeek of parsed.weeks) {
    const weekId = crypto.randomUUID()
    const weekLabel = legacyWeek.label ?? `Week ${weekOrder + 1}`
    const ts = Date.now()

    newWeeks.push({
      id: weekId,
      label: weekLabel,
      order: weekOrder++,
      updatedAt: ts,
    })

    let dayOrder = 0
    for (const legacyDay of legacyWeek.days) {
      const dayId = crypto.randomUUID()

      newDays.push({
        id: dayId,
        weekId,
        name: legacyDay.dayName,
        date: legacyDay.date,
        order: dayOrder++,
        updatedAt: ts,
      })

      let exOrder = 0
      for (const legacyEx of legacyDay.exercises) {
        const exerciseId = crypto.randomUUID()
        const lift = liftMap.get(legacyEx.name)!
        const plannedLoad = parseFloat(legacyEx.load) || 0
        const plannedSets = legacyEx.sets
        const plannedReps = legacyEx.reps

        newExercises.push({
          id: exerciseId,
          dayId,
          liftId: lift.id,
          plannedLoad,
          plannedSets,
          plannedReps,
          remarks: legacyEx.remarks ?? [],
          order: exOrder++,
          updatedAt: ts,
        })

        if (legacyEx.completed) {
          const completedAt = legacyDay.date
            ? (Date.parse(legacyDay.date) || ts)
            : ts

          for (let i = 0; i < plannedSets; i++) {
            newSetLogs.push({
              id: crypto.randomUUID(),
              exerciseId,
              liftId: lift.id,
              dayId,
              weight: plannedLoad,
              reps: plannedReps,
              completedAt,
              isWarmup: false,
              updatedAt: ts,
            })
          }
        }
      }
    }
  }

  // Write everything in one transaction (additive — no clear)
  const tables = [db.weeks, db.days, db.exercises, db.setLogs]
  await db.transaction('rw', tables, async () => {
    await Promise.all([
      db.weeks.bulkAdd(newWeeks),
      db.days.bulkAdd(newDays),
      db.exercises.bulkAdd(newExercises),
      db.setLogs.bulkAdd(newSetLogs),
    ])
  })
}
