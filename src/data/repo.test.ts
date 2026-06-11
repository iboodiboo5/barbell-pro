import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { repo } from './repo'

beforeEach(async () => {
  await Promise.all(db.tables.map(t => t.clear()))
})

describe('repo', () => {
  it('creates a week with sequential order', async () => {
    const w1 = await repo.addWeek('Week 1')
    const w2 = await repo.addWeek('Week 2')
    expect(w1.order).toBe(0)
    expect(w2.order).toBe(1)
  })

  it('cascade-deletes a week (days, exercises, setLogs)', async () => {
    // First week — the one we delete
    const w = await repo.addWeek('W')
    const d = await repo.addDay(w.id, 'Push')
    const ex = await repo.addExercise(d.id, { liftId: 'l1', plannedLoad: 100, plannedSets: 3, plannedReps: 5, remarks: [] })
    await db.setLogs.add({ id: 's1', exerciseId: ex.id, liftId: 'l1', dayId: d.id, weight: 100, reps: 5, completedAt: 1, isWarmup: false, updatedAt: 1 })

    // Second week — must survive the delete
    const w2 = await repo.addWeek('W2')
    const d2 = await repo.addDay(w2.id, 'Pull')
    const ex2 = await repo.addExercise(d2.id, { liftId: 'l2', plannedLoad: 80, plannedSets: 4, plannedReps: 8, remarks: [] })
    await db.setLogs.add({ id: 's2', exerciseId: ex2.id, liftId: 'l2', dayId: d2.id, weight: 80, reps: 8, completedAt: 2, isWarmup: false, updatedAt: 2 })

    await repo.deleteWeek(w.id)

    // First week's records are gone
    expect(await db.days.count()).toBe(1)
    expect(await db.exercises.count()).toBe(1)
    expect(await db.setLogs.count()).toBe(1)
    expect(await db.weeks.count()).toBe(1)

    // Second week's records all survive
    expect(await db.days.where('weekId').equals(w2.id).count()).toBe(1)
    expect(await db.exercises.where('dayId').equals(d2.id).count()).toBe(1)
    const survivingLog = await db.setLogs.get('s2')
    expect(survivingLog).toBeDefined()
  })

  it('duplicates a week with fresh ids and no set logs', async () => {
    const w = await repo.addWeek('Week 1')
    const d = await repo.addDay(w.id, 'Pull')
    const ex = await repo.addExercise(d.id, { liftId: 'l1', plannedLoad: 140, plannedSets: 3, plannedReps: 5, remarks: ['belt'] })
    // add a setLog on the source exercise — must NOT be duplicated
    await db.setLogs.add({ id: 'sl1', exerciseId: ex.id, liftId: 'l1', dayId: d.id, weight: 140, reps: 5, completedAt: 1, isWarmup: false, updatedAt: 1 })

    const copy = await repo.duplicateWeek(w.id)
    expect(copy.id).not.toBe(w.id)
    expect(copy.label).toBe('Week 2')
    const copyDays = await db.days.where('weekId').equals(copy.id).toArray()
    expect(copyDays).toHaveLength(1)
    const copyExs = await db.exercises.where('dayId').equals(copyDays[0].id).toArray()
    expect(copyExs).toHaveLength(1)
    expect(copyExs[0].plannedLoad).toBe(140)
    // setLog count must remain 1 — the duplicate must not copy logs
    expect(await db.setLogs.count()).toBe(1)
  })

  it('duplicateWeek copies loadText/repsText display values', async () => {
    const w = await repo.addWeek('Week 1')
    const d = await repo.addDay(w.id, 'Monday')
    const ex = await repo.addExercise(d.id, { liftId: 'l1', plannedLoad: 13.6, plannedSets: 3, plannedReps: 10, remarks: [] })
    await repo.updateExercise(ex.id, { loadText: '30lb', repsText: 'AMRAP' })
    await repo.addExercise(d.id, { liftId: 'l2', plannedLoad: 100, plannedSets: 5, plannedReps: 5, remarks: [] })

    const copy = await repo.duplicateWeek(w.id)
    const copyDays = await db.days.where('weekId').equals(copy.id).toArray()
    const copyExs = await db.exercises.where('dayId').equals(copyDays[0].id).toArray()
    const textEx = copyExs.find((e) => e.liftId === 'l1')
    expect(textEx?.loadText).toBe('30lb')
    expect(textEx?.repsText).toBe('AMRAP')
    // unset keys stay absent, not undefined-valued
    const plainEx = copyExs.find((e) => e.liftId === 'l2')
    expect(plainEx && 'loadText' in plainEx).toBe(false)
  })

  it('getSettings returns defaults when unset and persists updates', async () => {
    const s = await repo.getSettings()
    expect(s.barWeightKg).toBe(20)
    await repo.updateSettings({ units: 'lbs' })
    expect((await repo.getSettings()).units).toBe('lbs')
  })

  it('statCards default to two cards and persist a custom layout (deep copy)', async () => {
    const s = await repo.getSettings()
    expect(s.statCards).toHaveLength(2)
    expect(s.statCards[0]).toContain('est1rm')
    s.statCards[0].push('mutated') // mutating the returned copy must not stick
    expect((await repo.getSettings()).statCards[0]).not.toContain('mutated')

    await repo.updateSettings({ statCards: [['dots'], ['est1rm']] })
    expect((await repo.getSettings()).statCards).toEqual([['dots'], ['est1rm']])
  })

  it('setNotePinned toggles a note pin', async () => {
    const note = await repo.addNote('belt squats felt great')
    expect((await db.notes.get(note.id))?.pinned).toBeUndefined()
    await repo.setNotePinned(note.id, true)
    expect((await db.notes.get(note.id))?.pinned).toBe(true)
    await repo.setNotePinned(note.id, false)
    expect((await db.notes.get(note.id))?.pinned).toBe(false)
  })

  it('deleteDay cascades exercises+setLogs but leaves the week', async () => {
    const w = await repo.addWeek('W')
    const d1 = await repo.addDay(w.id, 'Push')
    const d2 = await repo.addDay(w.id, 'Pull')
    const ex1 = await repo.addExercise(d1.id, { liftId: 'l1', plannedLoad: 100, plannedSets: 3, plannedReps: 5, remarks: [] })
    await db.setLogs.add({ id: 's1', exerciseId: ex1.id, liftId: 'l1', dayId: d1.id, weight: 100, reps: 5, completedAt: 1, isWarmup: false, updatedAt: 1 })
    const ex2 = await repo.addExercise(d2.id, { liftId: 'l2', plannedLoad: 80, plannedSets: 4, plannedReps: 8, remarks: [] })
    await db.setLogs.add({ id: 's2', exerciseId: ex2.id, liftId: 'l2', dayId: d2.id, weight: 80, reps: 8, completedAt: 2, isWarmup: false, updatedAt: 2 })

    await repo.deleteDay(d1.id)

    // Week is still there
    expect(await db.weeks.count()).toBe(1)
    // Only d2 survives
    expect(await db.days.count()).toBe(1)
    expect((await db.days.toArray())[0].id).toBe(d2.id)
    // Only ex2 and s2 survive
    expect(await db.exercises.count()).toBe(1)
    expect((await db.exercises.toArray())[0].id).toBe(ex2.id)
    expect(await db.setLogs.count()).toBe(1)
    expect(await db.setLogs.get('s2')).toBeDefined()
  })

  it('reorderExercises respects day scoping and skips foreign ids', async () => {
    const w = await repo.addWeek('W')
    const dayA = await repo.addDay(w.id, 'Day A')
    const dayB = await repo.addDay(w.id, 'Day B')
    const a1 = await repo.addExercise(dayA.id, { liftId: 'l1', plannedLoad: 100, plannedSets: 3, plannedReps: 5, remarks: [] })
    const a2 = await repo.addExercise(dayA.id, { liftId: 'l2', plannedLoad: 80, plannedSets: 4, plannedReps: 8, remarks: [] })
    const b1 = await repo.addExercise(dayB.id, { liftId: 'l3', plannedLoad: 60, plannedSets: 3, plannedReps: 10, remarks: [] })
    const b1OriginalOrder = b1.order

    // Call reorderExercises on dayA with a2 first, then a1, then b1 (foreign)
    await expect(repo.reorderExercises(dayA.id, [a2.id, a1.id, b1.id])).resolves.toBeUndefined()

    const a2Updated = await db.exercises.get(a2.id)
    const a1Updated = await db.exercises.get(a1.id)
    const b1Updated = await db.exercises.get(b1.id)

    // a2 should now be order 0, a1 order 1
    expect(a2Updated?.order).toBe(0)
    expect(a1Updated?.order).toBe(1)
    // b1 belongs to dayB — its order must be unchanged
    expect(b1Updated?.order).toBe(b1OriginalOrder)
  })

  it('logSetQuick logs one planned set against the exercise', async () => {
    const w = await repo.addWeek('W')
    const d = await repo.addDay(w.id, 'Push')
    const ex = await repo.addExercise(d.id, { liftId: 'l1', plannedLoad: 27.5, plannedSets: 3, plannedReps: 10, remarks: [] })

    const log = await repo.logSetQuick(ex)

    expect(await db.setLogs.count()).toBe(1)
    const stored = await db.setLogs.get(log.id)
    expect(stored).toMatchObject({
      exerciseId: ex.id,
      liftId: 'l1',
      dayId: d.id,
      weight: 27.5,
      reps: 10,
      isWarmup: false,
    })
    expect(stored!.completedAt).toBeGreaterThan(0)
  })

  it('deleteExercise cascades its setLogs but leaves sibling exercises', async () => {
    const w = await repo.addWeek('W')
    const d = await repo.addDay(w.id, 'Push')
    const ex1 = await repo.addExercise(d.id, { liftId: 'l1', plannedLoad: 100, plannedSets: 3, plannedReps: 5, remarks: [] })
    const ex2 = await repo.addExercise(d.id, { liftId: 'l2', plannedLoad: 80, plannedSets: 4, plannedReps: 8, remarks: [] })
    await db.setLogs.add({ id: 's1', exerciseId: ex1.id, liftId: 'l1', dayId: d.id, weight: 100, reps: 5, completedAt: 1, isWarmup: false, updatedAt: 1 })
    await db.setLogs.add({ id: 's2', exerciseId: ex2.id, liftId: 'l2', dayId: d.id, weight: 80, reps: 8, completedAt: 2, isWarmup: false, updatedAt: 2 })

    await repo.deleteExercise(ex1.id)

    // Sibling exercise survives
    expect(await db.exercises.count()).toBe(1)
    expect((await db.exercises.toArray())[0].id).toBe(ex2.id)
    // Only s2 survives
    expect(await db.setLogs.count()).toBe(1)
    expect(await db.setLogs.get('s2')).toBeDefined()
    expect(await db.setLogs.get('s1')).toBeUndefined()
  })
})
