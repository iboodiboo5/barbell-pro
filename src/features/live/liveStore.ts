import { create } from 'zustand'
import { db } from '../../data/db'
import type { Exercise, LiveSession, SetLog } from '../../data/db'
import { repo } from '../../data/repo'
import { isNewPR } from '../../lib/prMath'

export interface SessionSummaryData {
  durationMs: number
  totalVolume: number
  setCount: number
  prCount: number
  prSets: SetLog[]
}

interface LiveState {
  session: LiveSession | null
  exercises: Exercise[]
  currentIndex: number
  /** Sets logged this session, per exercise id. */
  setCounts: Record<string, number>
  /** Wall-clock rest end (ms epoch); components derive remaining from this. Never a countdown. */
  restEndsAt: number | null
  /** Ids of this session's sets that were PRs when logged. */
  prSetIds: string[]
  summary: SessionSummaryData | null

  startSession: (dayId: string) => Promise<void>
  resumeIfActive: () => Promise<boolean>
  logSet: (args: { weight: number; reps: number; isWarmup?: boolean }) => Promise<{ isPR: boolean }>
  finishSession: () => Promise<SessionSummaryData>
  abandonSession: () => Promise<void>
  setCurrentIndex: (i: number) => void
  adjustRest: (deltaSec: number) => void
  clearRest: () => void
  reset: () => void
}

/** All sets logged during the given session, oldest first. */
async function sessionSets(session: LiveSession): Promise<SetLog[]> {
  const sets = await db.setLogs.where('dayId').equals(session.dayId).toArray()
  return sets
    .filter(s => s.completedAt >= session.startedAt)
    .sort((a, b) => a.completedAt - b.completedAt)
}

/**
 * Re-derive which of a resumed session's sets were PRs when logged: replay
 * them in order against history-so-far (all other lift logs + earlier
 * session sets), exactly mirroring the live check in logSet.
 */
async function replayPRs(ownSets: SetLog[]): Promise<string[]> {
  const ownIds = new Set(ownSets.map(s => s.id))
  const prIds: string[] = []
  const byLift = new Map<string, SetLog[]>()
  for (const set of ownSets) {
    if (!byLift.has(set.liftId)) {
      const all = await db.setLogs.where('liftId').equals(set.liftId).toArray()
      byLift.set(set.liftId, all.filter(s => !ownIds.has(s.id)))
    }
    const history = byLift.get(set.liftId)!
    if (isNewPR(history, set)) prIds.push(set.id)
    history.push(set)
  }
  return prIds
}

/** Most recent prior session's sets for a lift (grouped by day, latest day ≠ current). */
export async function lastSessionFor(liftId: string, excludeDayId: string): Promise<SetLog[]> {
  const all = await db.setLogs.where('liftId').equals(liftId).toArray()
  const byDay = new Map<string, SetLog[]>()
  for (const s of all) {
    if (s.dayId === excludeDayId || s.isWarmup) continue
    const list = byDay.get(s.dayId) ?? []
    list.push(s)
    byDay.set(s.dayId, list)
  }
  let best: SetLog[] = []
  let bestAt = -1
  for (const sets of byDay.values()) {
    const latest = Math.max(...sets.map(s => s.completedAt))
    if (latest > bestAt) {
      bestAt = latest
      best = sets
    }
  }
  return best.sort((a, b) => a.completedAt - b.completedAt)
}

const initialState = {
  session: null as LiveSession | null,
  exercises: [] as Exercise[],
  currentIndex: 0,
  setCounts: {} as Record<string, number>,
  restEndsAt: null as number | null,
  prSetIds: [] as string[],
  summary: null as SessionSummaryData | null,
}

export const useLiveStore = create<LiveState>((set, get) => ({
  ...initialState,

  async startSession(dayId) {
    const exercises = (await db.exercises.where('dayId').equals(dayId).toArray())
      .sort((a, b) => a.order - b.order)
    const session: LiveSession = {
      id: crypto.randomUUID(),
      dayId,
      startedAt: Date.now(),
      currentExerciseIndex: 0,
      updatedAt: Date.now(),
    }
    await db.liveSessions.add(session)
    set({ ...initialState, session, exercises })
  },

  async resumeIfActive() {
    const open = await db.liveSessions.filter(s => !s.finishedAt).toArray()
    if (open.length === 0) return false
    const session = open.sort((a, b) => b.startedAt - a.startedAt)[0]
    const exercises = (await db.exercises.where('dayId').equals(session.dayId).toArray())
      .sort((a, b) => a.order - b.order)
    if (exercises.length === 0) {
      // Day was deleted out from under the session — nothing to resume.
      await db.liveSessions.delete(session.id)
      return false
    }
    const ownSets = await sessionSets(session)
    const setCounts: Record<string, number> = {}
    for (const s of ownSets) setCounts[s.exerciseId] = (setCounts[s.exerciseId] ?? 0) + 1
    const prSetIds = await replayPRs(ownSets)
    set({
      ...initialState,
      session,
      exercises,
      setCounts,
      prSetIds,
      currentIndex: Math.min(session.currentExerciseIndex, exercises.length - 1),
    })
    return true
  },

  async logSet({ weight, reps, isWarmup = false }) {
    const { session, exercises, currentIndex, setCounts, prSetIds } = get()
    if (!session) throw new Error('logSet: no active session')
    const exercise = exercises[currentIndex]
    if (!exercise) throw new Error('logSet: no current exercise')

    // History BEFORE this set is written — the live PR check.
    const history = await db.setLogs.where('liftId').equals(exercise.liftId).toArray()
    const log: SetLog = {
      id: crypto.randomUUID(),
      exerciseId: exercise.id,
      liftId: exercise.liftId,
      dayId: session.dayId,
      weight,
      reps,
      completedAt: Date.now(),
      isWarmup,
      updatedAt: Date.now(),
    }
    const isPR = isNewPR(history, log)
    await db.setLogs.add(log)

    const settings = await repo.getSettings()
    set({
      setCounts: { ...setCounts, [exercise.id]: (setCounts[exercise.id] ?? 0) + 1 },
      prSetIds: isPR ? [...prSetIds, log.id] : prSetIds,
      restEndsAt: Date.now() + settings.restDefaultSec * 1000,
    })
    return { isPR }
  },

  async finishSession() {
    const { session, prSetIds } = get()
    if (!session) throw new Error('finishSession: no active session')
    const finishedAt = Date.now()
    await db.liveSessions.update(session.id, { finishedAt, updatedAt: finishedAt })

    const own = await sessionSets(session)
    const prIdSet = new Set(prSetIds)
    const summary: SessionSummaryData = {
      durationMs: finishedAt - session.startedAt,
      totalVolume: own.reduce((sum, s) => sum + (s.isWarmup ? 0 : s.weight * s.reps), 0),
      setCount: own.length,
      prCount: own.filter(s => prIdSet.has(s.id)).length,
      prSets: own.filter(s => prIdSet.has(s.id)),
    }
    set({ session: null, restEndsAt: null, summary })
    return summary
  },

  async abandonSession() {
    const { session } = get()
    if (session) {
      const at = Date.now()
      await db.liveSessions.update(session.id, { finishedAt: at, updatedAt: at })
    }
    set({ ...initialState })
  },

  setCurrentIndex(i) {
    const { session, exercises } = get()
    if (!session) return
    const clamped = Math.max(0, Math.min(exercises.length - 1, i))
    set({ currentIndex: clamped })
    void db.liveSessions.update(session.id, { currentExerciseIndex: clamped, updatedAt: Date.now() })
  },

  adjustRest(deltaSec) {
    const { restEndsAt } = get()
    if (restEndsAt === null) return
    // Never let the timer end in the past by more than "now".
    set({ restEndsAt: Math.max(Date.now(), restEndsAt + deltaSec * 1000) })
  },

  clearRest() {
    set({ restEndsAt: null })
  },

  reset() {
    set({ ...initialState })
  },
}))
