import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { repo } from './repo'
import { importParsedWeeks } from './programImport'
import type { ParsedWeek } from '../lib/workoutPaste'

beforeEach(async () => {
  await Promise.all(db.tables.map(t => t.clear()))
})

function sampleWeek(overrides: Partial<ParsedWeek> = {}): ParsedWeek {
  return {
    date: '2025-11-03',
    days: [
      {
        name: 'Monday',
        date: '2025-11-03',
        exercises: [
          { name: 'Rear Delt Flyes', loadKg: 55, sets: 3, reps: 12, remarks: ['55 6r @10'] },
          { name: 'Preacher Curl', loadKg: 13.6, loadText: '30lb', sets: 3, reps: 10, remarks: [] },
        ],
      },
      {
        name: 'Tuesday',
        date: '2025-11-04',
        exercises: [
          { name: 'Cardio of Choice', loadKg: 0, sets: 1, reps: 2, repsText: '2-30 min', remarks: ['Literally anything'] },
        ],
      },
    ],
    ...overrides,
  }
}

describe('importParsedWeeks', () => {
  it('creates weeks, days and exercises with intact FK chains and order', async () => {
    const { result, firstWeekId } = await importParsedWeeks([sampleWeek()])
    expect(result).toEqual({ weeks: 1, days: 2, exercises: 3 })

    const weeks = await db.weeks.toArray()
    expect(weeks).toHaveLength(1)
    expect(firstWeekId).toBe(weeks[0].id)

    const days = (await db.days.toArray()).sort((a, b) => a.order - b.order)
    expect(days.map(d => d.weekId)).toEqual([weeks[0].id, weeks[0].id])
    expect(days.map(d => d.name)).toEqual(['Monday', 'Tuesday'])
    expect(days.map(d => d.date)).toEqual(['2025-11-03', '2025-11-04'])
    expect(days.map(d => d.order)).toEqual([0, 1])

    const exercises = (await db.exercises.toArray()).sort((a, b) => a.order - b.order)
    const monday = exercises.filter(e => e.dayId === days[0].id)
    expect(monday).toHaveLength(2)
    expect(monday[0].plannedLoad).toBe(55)
    expect(monday[0].remarks).toEqual(['55 6r @10'])
    expect(monday[0].order).toBe(0)
    expect(monday[1].order).toBe(1)
    expect(monday[0].updatedAt).toBeGreaterThan(0)
  })

  it('persists loadText/repsText only when set', async () => {
    await importParsedWeeks([sampleWeek()])
    const exercises = await db.exercises.toArray()
    const curl = exercises.find(e => e.plannedLoad === 13.6)!
    expect(curl.loadText).toBe('30lb')
    expect('repsText' in curl).toBe(false)
    const cardio = exercises.find(e => e.repsText)!
    expect(cardio.repsText).toBe('2-30 min')
    expect('loadText' in cardio).toBe(false)
  })

  it('resolves lifts fuzzily so coach typos reuse the same lift', async () => {
    await importParsedWeeks([
      {
        days: [
          {
            name: 'Monday',
            exercises: [
              { name: 'Pause Bench Press', loadKg: 70, sets: 5, reps: 5, remarks: [] },
              { name: 'Puase Bench Press', loadKg: 72.5, sets: 5, reps: 5, remarks: [] },
            ],
          },
        ],
      },
    ])
    const lifts = await db.lifts.toArray()
    expect(lifts).toHaveLength(1)
    const exercises = await db.exercises.toArray()
    expect(new Set(exercises.map(e => e.liftId)).size).toBe(1)
  })

  it('labels dated weeks "Week of …" and undated weeks by continued numbering', async () => {
    await repo.addWeek('Week 1') // pre-existing
    await importParsedWeeks([
      sampleWeek(),
      sampleWeek({ date: undefined, label: undefined }),
      sampleWeek({ date: undefined, label: 'Week 9' }),
    ])
    const weeks = (await db.weeks.toArray()).sort((a, b) => a.order - b.order)
    expect(weeks.map(w => w.label)).toEqual(['Week 1', 'Week of 3 Nov 2025', 'Week 3', 'Week 9'])
    expect(weeks.map(w => w.order)).toEqual([0, 1, 2, 3])
  })

  it('is additive: existing data is untouched', async () => {
    const existing = await repo.addWeek('Keep me')
    const day = await repo.addDay(existing.id, 'Push')
    await repo.addExercise(day.id, { liftId: 'l1', plannedLoad: 100, plannedSets: 3, plannedReps: 5, remarks: [] })

    await importParsedWeeks([sampleWeek()])

    expect(await db.weeks.count()).toBe(2)
    expect((await db.weeks.get(existing.id))!.label).toBe('Keep me')
    expect(await db.exercises.count()).toBe(4)
  })

  it('returns a no-op result for empty input', async () => {
    const { result, firstWeekId } = await importParsedWeeks([])
    expect(result).toEqual({ weeks: 0, days: 0, exercises: 0 })
    expect(firstWeekId).toBeNull()
    expect(await db.weeks.count()).toBe(0)
  })
})
