import { db, DEFAULT_SETTINGS } from './db'
import type { Week, Day, Exercise, Note, BodyWeightEntry, Settings } from './db'

type ExercisePatch = Partial<Pick<Exercise, 'liftId' | 'plannedLoad' | 'plannedSets' | 'plannedReps' | 'loadText' | 'repsText' | 'remarks'>>

// ─── helpers ────────────────────────────────────────────────────────────────

function uuid(): string {
  return crypto.randomUUID()
}

function now(): number {
  return Date.now()
}

// ─── repo ───────────────────────────────────────────────────────────────────

export const repo = {

  // ── Weeks ──────────────────────────────────────────────────────────────

  async addWeek(label?: string): Promise<Week> {
    return db.transaction('rw', db.weeks, async () => {
      const count = await db.weeks.count()
      const all = await db.weeks.toArray()
      const maxOrder = all.reduce((m, w) => Math.max(m, w.order), -1)
      const resolvedLabel = label ?? `Week ${count + 1}`
      const week: Week = {
        id: uuid(),
        label: resolvedLabel,
        order: maxOrder + 1,
        updatedAt: now(),
      }
      await db.weeks.add(week)
      return week
    })
  },

  async deleteWeek(id: string): Promise<void> {
    await db.transaction('rw', db.weeks, db.days, db.exercises, db.setLogs, async () => {
      const days = await db.days.where('weekId').equals(id).toArray()
      const dayIds = days.map(d => d.id)
      const exercises = await db.exercises.where('dayId').anyOf(dayIds).toArray()
      const exerciseIds = exercises.map(e => e.id)
      await db.setLogs.where('exerciseId').anyOf(exerciseIds).delete()
      await db.exercises.where('dayId').anyOf(dayIds).delete()
      await db.days.where('weekId').equals(id).delete()
      await db.weeks.delete(id)
    })
  },

  async duplicateWeek(id: string): Promise<Week> {
    const source = await db.weeks.get(id)
    if (!source) throw new Error(`Week ${id} not found`)

    return db.transaction('rw', db.weeks, db.days, db.exercises, async () => {
      const count = await db.weeks.count()
      const all = await db.weeks.toArray()
      const maxOrder = all.reduce((m, w) => Math.max(m, w.order), -1)

      const newWeek: Week = {
        id: uuid(),
        label: `Week ${count + 1}`,
        order: maxOrder + 1,
        updatedAt: now(),
      }
      await db.weeks.add(newWeek)

      const sourceDays = await db.days.where('weekId').equals(id).toArray()
      for (const day of sourceDays) {
        const newDayId = uuid()
        const newDay: Day = {
          id: newDayId,
          weekId: newWeek.id,
          name: day.name,
          date: day.date,
          order: day.order,
          updatedAt: now(),
        }
        await db.days.add(newDay)

        const sourceExercises = await db.exercises.where('dayId').equals(day.id).toArray()
        for (const ex of sourceExercises) {
          const newEx: Exercise = {
            id: uuid(),
            dayId: newDayId,
            liftId: ex.liftId,
            plannedLoad: ex.plannedLoad,
            plannedSets: ex.plannedSets,
            plannedReps: ex.plannedReps,
            // verbatim coach-sheet display values; omit the keys when unset
            ...(ex.loadText !== undefined ? { loadText: ex.loadText } : {}),
            ...(ex.repsText !== undefined ? { repsText: ex.repsText } : {}),
            remarks: [...ex.remarks],
            order: ex.order,
            updatedAt: now(),
          }
          await db.exercises.add(newEx)
        }
      }

      return newWeek
    })
  },

  // ── Days ───────────────────────────────────────────────────────────────

  async addDay(weekId: string, name: string): Promise<Day> {
    return db.transaction('rw', db.days, async () => {
      const existing = await db.days.where('weekId').equals(weekId).toArray()
      const maxOrder = existing.reduce((m, d) => Math.max(m, d.order), -1)
      const day: Day = {
        id: uuid(),
        weekId,
        name,
        order: maxOrder + 1,
        updatedAt: now(),
      }
      await db.days.add(day)
      return day
    })
  },

  async deleteDay(id: string): Promise<void> {
    await db.transaction('rw', db.days, db.exercises, db.setLogs, async () => {
      const exercises = await db.exercises.where('dayId').equals(id).toArray()
      const exerciseIds = exercises.map(e => e.id)
      await db.setLogs.where('exerciseId').anyOf(exerciseIds).delete()
      await db.exercises.where('dayId').equals(id).delete()
      await db.days.delete(id)
    })
  },

  // ── Exercises ──────────────────────────────────────────────────────────

  async addExercise(
    dayId: string,
    partial: { liftId: string; plannedLoad: number; plannedSets: number; plannedReps: number; remarks: string[] }
  ): Promise<Exercise> {
    return db.transaction('rw', db.exercises, async () => {
      const existing = await db.exercises.where('dayId').equals(dayId).toArray()
      const maxOrder = existing.reduce((m, e) => Math.max(m, e.order), -1)
      const exercise: Exercise = {
        id: uuid(),
        dayId,
        liftId: partial.liftId,
        plannedLoad: partial.plannedLoad,
        plannedSets: partial.plannedSets,
        plannedReps: partial.plannedReps,
        remarks: partial.remarks,
        order: maxOrder + 1,
        updatedAt: now(),
      }
      await db.exercises.add(exercise)
      return exercise
    })
  },

  async updateExercise(id: string, patch: ExercisePatch): Promise<void> {
    await db.exercises.update(id, { ...patch, updatedAt: now() })
  },

  async deleteExercise(id: string): Promise<void> {
    await db.transaction('rw', db.exercises, db.setLogs, async () => {
      await db.setLogs.where('exerciseId').equals(id).delete()
      await db.exercises.delete(id)
    })
  },

  async reorderExercises(dayId: string, orderedIds: string[]): Promise<void> {
    await db.transaction('rw', db.exercises, async () => {
      for (let i = 0; i < orderedIds.length; i++) {
        const existing = await db.exercises.get(orderedIds[i])
        if (existing && existing.dayId === dayId) {
          await db.exercises.update(existing.id, { order: i, updatedAt: now() })
        }
      }
    })
  },

  // ── Settings ───────────────────────────────────────────────────────────

  async getSettings(): Promise<Settings> {
    const stored = await db.settings.get('app')
    const merged: Settings = stored
      ? { ...DEFAULT_SETTINGS, ...stored }
      : { ...DEFAULT_SETTINGS }
    merged.platesKg = [...merged.platesKg]
    return merged
  },

  async updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
    const current = await repo.getSettings()
    const updated: Settings = { ...current, ...patch, id: 'app', updatedAt: now() }
    await db.settings.put(updated)
  },

  // ── Notes ──────────────────────────────────────────────────────────────

  async addNote(text: string): Promise<Note> {
    const note: Note = {
      id: uuid(),
      text,
      createdAt: now(),
      updatedAt: now(),
    }
    await db.notes.add(note)
    return note
  },

  async updateNote(id: string, text: string): Promise<void> {
    await db.notes.update(id, { text, updatedAt: now() })
  },

  async deleteNote(id: string): Promise<void> {
    await db.notes.delete(id)
  },

  // ── Body Weight ────────────────────────────────────────────────────────

  async addBodyWeight(weightKg: number, date: string): Promise<BodyWeightEntry> {
    const entry: BodyWeightEntry = {
      id: uuid(),
      weightKg,
      date,
      updatedAt: now(),
    }
    await db.bodyWeights.add(entry)
    return entry
  },

  async deleteBodyWeight(id: string): Promise<void> {
    await db.bodyWeights.delete(id)
  },
}
