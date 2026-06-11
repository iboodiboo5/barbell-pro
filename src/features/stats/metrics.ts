import type { BodyWeightEntry, Lift, SetLog } from '../../data/db'
import { normalizeLiftName } from '../../data/liftCatalog'
import { dotsScore, epley1RM } from '../../lib/prMath'
import { kgToLbs } from '../../lib/plateMath'
import type { ChartPoint } from '../../ui/LineChart'
import { mondayOf } from './consistency'

/**
 * Metric registry + pure series builders for the Profile graph cards.
 * Weights stay kg internally; builders that emit weight-based y values take
 * the display units and convert at the edge, like the old stats cards did.
 */

export type MetricId =
  | 'est1rm'
  | 'maxWeight'
  | 'maxReps'
  | 'liftVolume'
  | 'bodyweight'
  | 'dots'
  | 'weeklyVolume'

export type MetricKind = 'lift' | 'global'

export const METRICS: Record<MetricId, { label: string; kind: MetricKind }> = {
  est1rm: { label: 'Est 1RM', kind: 'lift' },
  maxWeight: { label: 'Max weight', kind: 'lift' },
  maxReps: { label: 'Max reps', kind: 'lift' },
  liftVolume: { label: 'Volume', kind: 'lift' },
  bodyweight: { label: 'Weight', kind: 'global' },
  dots: { label: 'DOTS', kind: 'global' },
  weeklyVolume: { label: 'Weekly vol', kind: 'global' },
}

export const METRIC_IDS = Object.keys(METRICS) as MetricId[]

export const DEFAULT_STAT_CARDS: MetricId[][] = [
  ['est1rm', 'maxWeight', 'maxReps', 'liftVolume'],
  ['bodyweight', 'dots', 'weeklyVolume'],
]

/**
 * Validate a stored card layout: keep known ids in their stored card/order,
 * drop unknowns and duplicates, and re-home any missing metric to the card
 * the default layout puts it on.
 */
export function sanitizeStatCards(stored: unknown): MetricId[][] {
  const cards: MetricId[][] = [[], []]
  const seen = new Set<MetricId>()
  if (Array.isArray(stored)) {
    for (let c = 0; c < 2; c++) {
      const arr = stored[c]
      if (!Array.isArray(arr)) continue
      for (const id of arr) {
        if (METRIC_IDS.includes(id as MetricId) && !seen.has(id as MetricId)) {
          seen.add(id as MetricId)
          cards[c].push(id as MetricId)
        }
      }
    }
  }
  DEFAULT_STAT_CARDS.forEach((defaults, c) => {
    for (const id of defaults) {
      if (!seen.has(id)) {
        seen.add(id)
        cards[c].push(id)
      }
    }
  })
  return cards
}

export type Range = '3m' | '6m' | '1y' | 'all'
export const RANGES: Array<{ id: Range; label: string }> = [
  { id: '3m', label: '3M' },
  { id: '6m', label: '6M' },
  { id: '1y', label: '1Y' },
  { id: 'all', label: 'All' },
]

const DAY_MS = 86_400_000
const RANGE_DAYS: Record<Exclude<Range, 'all'>, number> = { '3m': 91, '6m': 183, '1y': 365 }

export function filterRange(points: ChartPoint[], range: Range, now: number): ChartPoint[] {
  if (range === 'all') return points
  const cutoff = now - RANGE_DAYS[range] * DAY_MS
  return points.filter((p) => p.x >= cutoff)
}

function localIso(ts: number): string {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const localMidnight = (iso: string) => new Date(`${iso}T00:00`).getTime()

const dateLabel = (ts: number) =>
  new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' })

const working = (logs: SetLog[]) => logs.filter((s) => !s.isWarmup && s.reps > 0 && s.weight > 0)

const round1 = (n: number) => Math.round(n * 10) / 10

/** Per-session-date series for one lift's logs (lift-kind metrics). */
export function liftMetricSeries(
  metric: Extract<MetricId, 'est1rm' | 'maxWeight' | 'maxReps' | 'liftVolume'>,
  logs: SetLog[],
  units: 'kg' | 'lbs',
): ChartPoint[] {
  const byDate = new Map<string, SetLog[]>()
  for (const s of working(logs)) {
    const iso = localIso(s.completedAt)
    const list = byDate.get(iso) ?? []
    list.push(s)
    byDate.set(iso, list)
  }
  const convert = (kg: number) => round1(units === 'kg' ? kg : kgToLbs(kg))
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, sets]) => {
      const x = localMidnight(iso)
      let y: number
      switch (metric) {
        case 'est1rm':
          y = convert(Math.max(...sets.map((s) => epley1RM(s.weight, s.reps))))
          break
        case 'maxWeight':
          y = convert(Math.max(...sets.map((s) => s.weight)))
          break
        case 'maxReps':
          y = Math.max(...sets.map((s) => s.reps))
          break
        case 'liftVolume':
          y = Math.round(
            (units === 'kg' ? 1 : kgToLbs(1)) * sets.reduce((sum, s) => sum + s.weight * s.reps, 0),
          )
          break
      }
      return { x, y, label: dateLabel(x) }
    })
}

/** squat / bench / deadlift bucket for a lift name, or null. */
export function sbdKeyword(name: string): 'squat' | 'bench' | 'deadlift' | null {
  const n = normalizeLiftName(name)
  if (n.includes('squat')) return 'squat'
  if (n.includes('bench')) return 'bench'
  if (n.includes('deadlift')) return 'deadlift'
  return null
}

/**
 * DOTS history: at each calendar date with ≥1 working SBD set, the score from
 * the running-best est-1RM per S/B/D so far + the nearest bodyweight entry
 * dated on/before that date. Dates before all four exist are skipped.
 */
export function dotsSeries(
  logs: SetLog[],
  lifts: Lift[],
  bodyWeights: BodyWeightEntry[],
  sex: 'male' | 'female',
): ChartPoint[] {
  const keywordByLift = new Map<string, 'squat' | 'bench' | 'deadlift'>()
  for (const lift of lifts) {
    const kw = sbdKeyword(lift.name)
    if (kw) keywordByLift.set(lift.id, kw)
  }
  const sbdLogs = working(logs)
    .filter((s) => keywordByLift.has(s.liftId))
    .sort((a, b) => a.completedAt - b.completedAt)
  const bw = [...bodyWeights].sort((a, b) => a.date.localeCompare(b.date))

  const best: Record<'squat' | 'bench' | 'deadlift', number> = { squat: 0, bench: 0, deadlift: 0 }
  const points: ChartPoint[] = []
  let i = 0
  while (i < sbdLogs.length) {
    const iso = localIso(sbdLogs[i].completedAt)
    while (i < sbdLogs.length && localIso(sbdLogs[i].completedAt) === iso) {
      const s = sbdLogs[i]
      const kw = keywordByLift.get(s.liftId)!
      best[kw] = Math.max(best[kw], epley1RM(s.weight, s.reps))
      i++
    }
    if (best.squat === 0 || best.bench === 0 || best.deadlift === 0) continue
    let nearest: BodyWeightEntry | null = null
    for (const entry of bw) {
      if (entry.date <= iso) nearest = entry
      else break
    }
    if (!nearest) continue
    const x = localMidnight(iso)
    const total = best.squat + best.bench + best.deadlift
    points.push({ x, y: round1(dotsScore(total, nearest.weightKg, sex)), label: dateLabel(x) })
  }
  return points
}

export function bodyweightSeries(entries: BodyWeightEntry[], units: 'kg' | 'lbs'): ChartPoint[] {
  return [...entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => {
      const x = localMidnight(e.date)
      return { x, y: round1(units === 'kg' ? e.weightKg : kgToLbs(e.weightKg)), label: dateLabel(x) }
    })
}

/** Σ weight×reps of working sets per week, keyed by Monday. */
export function weeklyVolumeSeries(logs: SetLog[], units: 'kg' | 'lbs'): ChartPoint[] {
  const byWeek = new Map<string, number>()
  for (const s of logs) {
    if (s.isWarmup) continue
    const ws = mondayOf(localIso(s.completedAt))
    byWeek.set(ws, (byWeek.get(ws) ?? 0) + s.weight * s.reps)
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ws, volKg]) => {
      const x = localMidnight(ws)
      return {
        x,
        y: Math.round(units === 'kg' ? volKg : kgToLbs(volKg)),
        label: `wk ${new Date(x).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`,
      }
    })
}
