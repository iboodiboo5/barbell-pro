import { describe, it, expect } from 'vitest'
import type { BodyWeightEntry, Lift, SetLog } from '../../data/db'
import {
  bodyweightSeries,
  DEFAULT_STAT_CARDS,
  dotsSeries,
  filterRange,
  liftMetricSeries,
  sanitizeStatCards,
  sbdKeyword,
  weeklyVolumeSeries,
} from './metrics'

const ts = (iso: string, hour = 12) => new Date(`${iso}T${String(hour).padStart(2, '0')}:00`).getTime()

let n = 0
const log = (liftId: string, iso: string, weight: number, reps: number, isWarmup = false): SetLog => ({
  id: `log-${n++}`,
  exerciseId: 'ex',
  dayId: 'day',
  liftId,
  weight,
  reps,
  completedAt: ts(iso),
  isWarmup,
  updatedAt: 0,
})

const lift = (id: string, name: string): Lift => ({ id, name, aliases: [], updatedAt: 0 })
const bw = (date: string, weightKg: number): BodyWeightEntry => ({ id: `bw-${n++}`, date, weightKg, updatedAt: 0 })

describe('liftMetricSeries', () => {
  const logs = [
    log('sq', '2026-01-05', 100, 5),
    log('sq', '2026-01-05', 110, 3),
    log('sq', '2026-01-05', 60, 10, true), // warmup — ignored
    log('sq', '2026-01-12', 105, 8),
  ]

  it('est1rm takes the best Epley per date', () => {
    const pts = liftMetricSeries('est1rm', logs, 'kg')
    expect(pts).toHaveLength(2)
    expect(pts[0].y).toBe(121) // 110×(1+3/30) = 121 beats 100×(1+5/30)
    expect(pts[1].y).toBe(133) // 105×(1+8/30)
  })

  it('maxWeight / maxReps / liftVolume', () => {
    expect(liftMetricSeries('maxWeight', logs, 'kg').map((p) => p.y)).toEqual([110, 105])
    expect(liftMetricSeries('maxReps', logs, 'kg').map((p) => p.y)).toEqual([5, 8])
    expect(liftMetricSeries('liftVolume', logs, 'kg').map((p) => p.y)).toEqual([830, 840])
  })

  it('converts weight metrics to lbs but never reps', () => {
    expect(liftMetricSeries('maxWeight', logs, 'lbs')[0].y).toBe(242.5)
    expect(liftMetricSeries('maxReps', logs, 'lbs')[0].y).toBe(5)
  })
})

describe('sbdKeyword', () => {
  it('buckets variants', () => {
    expect(sbdKeyword('Zercher Squat')).toBe('squat')
    expect(sbdKeyword('Spoto Bench Press')).toBe('bench')
    expect(sbdKeyword('Deficit Paused Deadlift')).toBe('deadlift')
    expect(sbdKeyword('Lat Pulldown')).toBeNull()
  })
})

describe('dotsSeries', () => {
  const lifts = [lift('sq', 'High Bar Squat'), lift('bp', 'Bench Press'), lift('dl', 'Deadlift'), lift('curl', 'Bicep Curl')]

  it('emits points only once squat+bench+deadlift+bodyweight all exist, with running bests', () => {
    const logs = [
      log('sq', '2026-01-05', 100, 1),
      log('bp', '2026-01-07', 70, 1),
      log('curl', '2026-01-07', 20, 10), // not SBD — never creates a point
      log('dl', '2026-01-09', 140, 1),
      log('sq', '2026-01-16', 110, 1), // squat PR raises the running total
    ]
    const weights = [bw('2026-01-01', 80)]
    const pts = dotsSeries(logs, lifts, weights, 'male')
    expect(pts).toHaveLength(2)
    expect(new Date(pts[0].x).getDate()).toBe(9)
    expect(pts[1].y).toBeGreaterThan(pts[0].y)
  })

  it('uses the nearest bodyweight on/before each date and skips dates with none', () => {
    const logs = [
      log('sq', '2026-01-05', 100, 1),
      log('bp', '2026-01-05', 70, 1),
      log('dl', '2026-01-05', 140, 1),
      log('dl', '2026-02-05', 150, 1),
    ]
    const weights = [bw('2026-01-20', 80), bw('2026-02-01', 76)]
    const pts = dotsSeries(logs, lifts, weights, 'male')
    // 2026-01-05 has no prior bodyweight — skipped; only the Feb session scores.
    expect(pts).toHaveLength(1)
    // Lighter lifter + bigger total → uses the 76 kg (Feb 1) entry.
    const total = 100 + 70 + 150
    expect(pts[0].y).toBeGreaterThan(0)
    expect(pts[0].y).toBe(Math.round((total * 500) / (-307.75076 + 24.0900756 * 76 + -0.1918759221 * 76 ** 2 + 0.0007391293 * 76 ** 3 + -0.000001093 * 76 ** 4) * 10) / 10)
  })
})

describe('bodyweightSeries / weeklyVolumeSeries', () => {
  it('sorts bodyweight entries by date and converts units', () => {
    const pts = bodyweightSeries([bw('2026-02-01', 80), bw('2026-01-01', 82)], 'lbs')
    expect(pts.map((p) => p.y)).toEqual([180.8, 176.4])
  })

  it('groups volume by Monday and skips warmups', () => {
    const logs = [
      log('sq', '2026-01-06', 100, 5), // Tue → wk of Mon 5th
      log('sq', '2026-01-08', 100, 5), // Thu → same week
      log('sq', '2026-01-13', 50, 10), // next Tue
      log('sq', '2026-01-13', 50, 10, true),
    ]
    const pts = weeklyVolumeSeries(logs, 'kg')
    expect(pts.map((p) => p.y)).toEqual([1000, 500])
  })
})

describe('filterRange', () => {
  const now = ts('2026-06-11')
  const pts = [
    { x: ts('2025-01-01'), y: 1 },
    { x: ts('2026-01-01'), y: 2 },
    { x: ts('2026-05-01'), y: 3 },
  ]
  it('cuts off by window', () => {
    expect(filterRange(pts, 'all', now)).toHaveLength(3)
    expect(filterRange(pts, '1y', now).map((p) => p.y)).toEqual([2, 3])
    expect(filterRange(pts, '3m', now).map((p) => p.y)).toEqual([3])
  })
})

describe('sanitizeStatCards', () => {
  it('returns the default for garbage', () => {
    expect(sanitizeStatCards(undefined)).toEqual(DEFAULT_STAT_CARDS)
    expect(sanitizeStatCards('nope')).toEqual(DEFAULT_STAT_CARDS)
  })

  it('keeps stored placement/order, drops unknowns and dupes, re-homes missing ids', () => {
    const cards = sanitizeStatCards([
      ['dots', 'est1rm', 'bogus', 'dots'],
      ['maxWeight'],
    ])
    expect(cards[0]).toEqual(['dots', 'est1rm', 'maxReps', 'liftVolume'])
    expect(cards[1]).toEqual(['maxWeight', 'bodyweight', 'weeklyVolume'])
  })
})
