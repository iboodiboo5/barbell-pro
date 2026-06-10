import { db } from './db'
import type { Week, Day, Exercise, Lift } from './db'
import { resolveLift } from './liftCatalog'
import type { ParsedWeek } from '../lib/workoutPaste'

export interface ImportResult { weeks: number; days: number; exercises: number }

export function weekOfLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00`)
  return `Week of ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

/**
 * Write parsed paste weeks into the program. Additive — never clears.
 * Lift names resolve through the fuzzy catalog (coach typos reuse lifts).
 */
export async function importParsedWeeks(
  parsed: ParsedWeek[]
): Promise<{ result: ImportResult; firstWeekId: string | null }> {
  if (parsed.length === 0) {
    return { result: { weeks: 0, days: 0, exercises: 0 }, firstWeekId: null }
  }

  // resolveLift writes to db.lifts — run it before the transaction
  const liftByName = new Map<string, Lift>()
  for (const week of parsed) {
    for (const day of week.days) {
      for (const ex of day.exercises) {
        if (!liftByName.has(ex.name)) liftByName.set(ex.name, await resolveLift(ex.name))
      }
    }
  }

  const existingWeeks = await db.weeks.toArray()
  const existingCount = existingWeeks.length
  let order = existingWeeks.reduce((m, w) => Math.max(m, w.order), -1) + 1

  const ts = Date.now()
  const newWeeks: Week[] = []
  const newDays: Day[] = []
  const newExercises: Exercise[] = []

  parsed.forEach((week, i) => {
    const weekId = crypto.randomUUID()
    const label =
      week.label ??
      (week.date ? weekOfLabel(week.date) : `Week ${existingCount + i + 1}`)
    newWeeks.push({ id: weekId, label, order: order++, updatedAt: ts })

    week.days.forEach((day, dayOrder) => {
      const dayId = crypto.randomUUID()
      newDays.push({ id: dayId, weekId, name: day.name, date: day.date, order: dayOrder, updatedAt: ts })

      day.exercises.forEach((ex, exOrder) => {
        const exercise: Exercise = {
          id: crypto.randomUUID(),
          dayId,
          liftId: liftByName.get(ex.name)!.id,
          plannedLoad: ex.loadKg,
          plannedSets: ex.sets,
          plannedReps: ex.reps,
          remarks: ex.remarks,
          order: exOrder,
          updatedAt: ts,
        }
        if (ex.loadText !== undefined) exercise.loadText = ex.loadText
        if (ex.repsText !== undefined) exercise.repsText = ex.repsText
        newExercises.push(exercise)
      })
    })
  })

  await db.transaction('rw', db.weeks, db.days, db.exercises, async () => {
    await Promise.all([
      db.weeks.bulkAdd(newWeeks),
      db.days.bulkAdd(newDays),
      db.exercises.bulkAdd(newExercises),
    ])
  })

  return {
    result: { weeks: newWeeks.length, days: newDays.length, exercises: newExercises.length },
    firstWeekId: newWeeks[0].id,
  }
}
