import 'fake-indexeddb/auto'
import { it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { repo } from './repo'
import { exportBackup, importBackup, detectFormat, migrateLegacy, previewCounts } from './backup'

beforeEach(async () => { await Promise.all(db.tables.map(t => t.clear())) })

it('export → import round-trips all data', async () => {
  const w = await repo.addWeek('Week 1')
  await repo.addDay(w.id, 'Push')
  const json = await exportBackup()
  await Promise.all(db.tables.map(t => t.clear()))
  const preview = await importBackup(json)
  expect(preview.weeks).toBe(1)
  expect(await db.weeks.count()).toBe(1)
  expect(await db.days.count()).toBe(1)
})

it('rejects invalid payloads without writing', async () => {
  await repo.addWeek('Keep me')
  await expect(importBackup('{"nope":true}')).rejects.toThrow()
  expect(await db.weeks.count()).toBe(1)
})

it('clears stale live sessions on destructive import', async () => {
  const json = await exportBackup()
  await db.liveSessions.add({ id: 'ls1', dayId: 'gone', startedAt: 1, currentExerciseIndex: 0, updatedAt: 1 })
  await importBackup(json)
  expect(await db.liveSessions.count()).toBe(0)
})

it('previewCounts reports v2 and legacy counts without writing', async () => {
  const w = await repo.addWeek('Week 1')
  const d = await repo.addDay(w.id, 'Push')
  await db.setLogs.add({ id: 's1', exerciseId: 'e', liftId: 'l', dayId: d.id, weight: 100, reps: 5, completedAt: 1, isWarmup: false, updatedAt: 1 })
  const json = await exportBackup()
  await Promise.all(db.tables.map(t => t.clear()))
  expect(previewCounts(json, 'v2')).toEqual({ weeks: 1, setLogs: 1, lifts: 0 })
  expect(await db.weeks.count()).toBe(0) // nothing written

  const legacy = JSON.stringify({
    weeks: [{ days: [{ dayName: 'Pull', exercises: [
      { name: 'Deadlift', load: '140', sets: 3, reps: 5, completed: true },
      { name: 'Row', load: '80', sets: 4, reps: 8, completed: false },
    ] }] }],
  })
  expect(previewCounts(legacy, 'legacy')).toEqual({ weeks: 1, setLogs: 3, lifts: 2 })
})

it('detects legacy format and migrates with set logs for completed exercises', async () => {
  const legacy = JSON.stringify({
    weeks: [{ id: 'w1', label: 'Week 1', days: [{
      dayName: 'Pull', date: '2026-01-05',
      exercises: [
        { id: 'e1', name: 'Deadlift', load: '140', sets: 3, reps: 5, remarks: ['belt'], completed: true },
        { id: 'e2', name: 'Row', load: '80', sets: 4, reps: 8, remarks: [], completed: false },
      ],
    }] }],
    currentWeekIndex: 0,
  })
  expect(detectFormat(legacy)).toBe('legacy')
  await migrateLegacy(legacy)
  expect(await db.weeks.count()).toBe(1)
  expect(await db.exercises.count()).toBe(2)
  expect(await db.setLogs.count()).toBe(3) // only the completed exercise: 3 sets of 5
  const lifts = await db.lifts.toArray()
  expect(lifts.map(l => l.name).sort()).toEqual(['Deadlift', 'Row'])
})
