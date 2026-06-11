/**
 * Lift list ranking for the Profile tab.
 *
 * Lifters care most about what they're doing TODAY, then this week's program,
 * then the big compounds — and recency must decay smoothly (τ ≈ 3 weeks) so
 * weekly-alternating variants (zercher squat one week, back squat the next)
 * both stay near the top instead of last week's variant falling off a cliff.
 */

export interface LiftRankRow {
  id: string
  name: string
  /** completedAt timestamps of this lift's logged sets (any order). */
  sessionDates: number[]
}

export interface LiftRankCtx {
  now: number
  /** Lift ids planned in today's startable day (or the active live session). */
  todayLiftIds: Set<string>
  /** Lift ids planned anywhere in the latest program week. */
  latestWeekLiftIds: Set<string>
}

export interface RankedLift extends LiftRankRow {
  score: number
  isToday: boolean
  lastDone: number | null
}

const DAY_MS = 86_400_000
/** Recency half-life driver: e-folding time in days. */
const RECENCY_TAU_DAYS = 21

const W_TODAY = 3
const W_WEEK = 1.2
// 2.5 (not 2): a last-week compound variant must clear a frequent,
// fresher in-program accessory — see the alternating-variants test.
const W_COMPOUND = 2.5
const W_FREQUENCY = 0.6
const W_RECENCY = 2

/** 1 for the big three (any variant), 0.7 for presses/rows, 0 otherwise. */
export function compoundWeight(name: string): number {
  const n = name.toLowerCase()
  if (/squat|bench|deadlift/.test(n)) return 1
  if (/press|row(?:s|\b)/.test(n)) return 0.7
  return 0
}

export function liftScore(row: LiftRankRow, ctx: LiftRankCtx): number {
  const sessions = row.sessionDates.length
  const last = sessions ? Math.max(...row.sessionDates) : null
  const recency =
    last === null ? 0 : Math.exp(-Math.max(0, ctx.now - last) / DAY_MS / RECENCY_TAU_DAYS)
  return (
    (ctx.todayLiftIds.has(row.id) ? W_TODAY : 0) +
    (ctx.latestWeekLiftIds.has(row.id) ? W_WEEK : 0) +
    W_COMPOUND * compoundWeight(row.name) +
    W_FREQUENCY * Math.log(1 + sessions) +
    W_RECENCY * recency
  )
}

/** Sort lifts by score desc; ties break by most recent, then name. */
export function rankLifts(rows: LiftRankRow[], ctx: LiftRankCtx): RankedLift[] {
  return rows
    .map((row) => {
      const lastDone = row.sessionDates.length ? Math.max(...row.sessionDates) : null
      return { ...row, score: liftScore(row, ctx), isToday: ctx.todayLiftIds.has(row.id), lastDone }
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.lastDone ?? 0) - (a.lastDone ?? 0) ||
        a.name.localeCompare(b.name),
    )
}
