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
    const w = await repo.addWeek('W')
    const d = await repo.addDay(w.id, 'Push')
    const ex = await repo.addExercise(d.id, { liftId: 'l1', plannedLoad: 100, plannedSets: 3, plannedReps: 5, remarks: [] })
    await db.setLogs.add({ id: 's1', exerciseId: ex.id, liftId: 'l1', dayId: d.id, weight: 100, reps: 5, completedAt: 1, isWarmup: false, updatedAt: 1 })
    await repo.deleteWeek(w.id)
    expect(await db.days.count()).toBe(0)
    expect(await db.exercises.count()).toBe(0)
    expect(await db.setLogs.count()).toBe(0)
  })

  it('duplicates a week with fresh ids and no set logs', async () => {
    const w = await repo.addWeek('Week 1')
    const d = await repo.addDay(w.id, 'Pull')
    await repo.addExercise(d.id, { liftId: 'l1', plannedLoad: 140, plannedSets: 3, plannedReps: 5, remarks: ['belt'] })
    const copy = await repo.duplicateWeek(w.id)
    expect(copy.id).not.toBe(w.id)
    expect(copy.label).toBe('Week 2')
    const copyDays = await db.days.where('weekId').equals(copy.id).toArray()
    expect(copyDays).toHaveLength(1)
    const copyExs = await db.exercises.where('dayId').equals(copyDays[0].id).toArray()
    expect(copyExs).toHaveLength(1)
    expect(copyExs[0].plannedLoad).toBe(140)
  })

  it('getSettings returns defaults when unset and persists updates', async () => {
    const s = await repo.getSettings()
    expect(s.barWeightKg).toBe(20)
    await repo.updateSettings({ units: 'lbs' })
    expect((await repo.getSettings()).units).toBe('lbs')
  })
})
