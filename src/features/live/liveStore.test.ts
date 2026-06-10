import 'fake-indexeddb/auto'
import { it, expect, beforeEach } from 'vitest'
import { db } from '../../data/db'
import { repo } from '../../data/repo'
import { useLiveStore } from './liveStore'

beforeEach(async () => {
  await Promise.all(db.tables.map(t => t.clear()))
  useLiveStore.setState(useLiveStore.getInitialState())
})

async function seedDay() {
  const w = await repo.addWeek('W')
  const d = await repo.addDay(w.id, 'Pull')
  const ex = await repo.addExercise(d.id, { liftId: 'lift-dl', plannedLoad: 140, plannedSets: 3, plannedReps: 5, remarks: [] })
  return { d, ex }
}

it('startSession persists a LiveSession and loads exercises', async () => {
  const { d } = await seedDay()
  await useLiveStore.getState().startSession(d.id)
  expect(useLiveStore.getState().exercises).toHaveLength(1)
  expect(await db.liveSessions.count()).toBe(1)
})

it('logSet writes a SetLog and flags PRs', async () => {
  const { d } = await seedDay()
  await useLiveStore.getState().startSession(d.id)
  const r1 = await useLiveStore.getState().logSet({ weight: 140, reps: 5 })
  expect(r1.isPR).toBe(true) // first ever set is a PR
  expect(await db.setLogs.count()).toBe(1)
  const r2 = await useLiveStore.getState().logSet({ weight: 135, reps: 5 })
  expect(r2.isPR).toBe(false)
})

it('resumeIfActive restores an unfinished session', async () => {
  const { d } = await seedDay()
  await useLiveStore.getState().startSession(d.id)
  useLiveStore.setState(useLiveStore.getInitialState()) // simulate app relaunch
  const resumed = await useLiveStore.getState().resumeIfActive()
  expect(resumed).toBe(true)
  expect(useLiveStore.getState().session?.dayId).toBe(d.id)
})

it('finishSession computes summary and clears active session', async () => {
  const { d } = await seedDay()
  await useLiveStore.getState().startSession(d.id)
  await useLiveStore.getState().logSet({ weight: 140, reps: 5 })
  const summary = await useLiveStore.getState().finishSession()
  expect(summary.totalVolume).toBe(700)
  expect(summary.prCount).toBe(1)
  expect(await db.liveSessions.filter(s => !s.finishedAt).count()).toBe(0)
})
