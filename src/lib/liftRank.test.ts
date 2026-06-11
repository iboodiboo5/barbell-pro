import { describe, it, expect } from 'vitest'
import { compoundWeight, liftScore, rankLifts, type LiftRankCtx } from './liftRank'
import { NOV_WEEK } from './__fixtures__/novWeek'
import { parseWorkoutPaste } from './workoutPaste'

const DAY = 86_400_000
const NOW = new Date('2026-06-11T12:00:00').getTime()

/** n sessions, the latest `daysAgo` days ago, spaced weekly before that. */
const sessions = (daysAgo: number, n = 6) =>
  Array.from({ length: n }, (_, i) => NOW - (daysAgo + i * 7) * DAY)

const ctx = (over: Partial<LiftRankCtx> = {}): LiftRankCtx => ({
  now: NOW,
  todayLiftIds: new Set(),
  latestWeekLiftIds: new Set(),
  ...over,
})

describe('compoundWeight', () => {
  it('big three variants score 1', () => {
    expect(compoundWeight('Zercher Squat')).toBe(1)
    expect(compoundWeight('Spoto Bench Press')).toBe(1)
    expect(compoundWeight('Deficit Paused Deadlift')).toBe(1)
  })
  it('presses and rows score 0.7, accessories 0', () => {
    expect(compoundWeight('BTN Press')).toBe(0.7)
    expect(compoundWeight('Chest Supported Row')).toBe(0.7)
    expect(compoundWeight('Lateral Raise Machine')).toBe(0)
    expect(compoundWeight('Bicep Curls')).toBe(0)
  })
})

describe('rankLifts scenarios', () => {
  it('alternating squat variants both rank above accessories', () => {
    // Back squat done yesterday (in this week), zercher 8 days ago (last week),
    // curls done 2 days ago and MORE frequent than either.
    const rows = [
      { id: 'back', name: 'Back Squat', sessionDates: sessions(1) },
      { id: 'zercher', name: 'Zercher Squat', sessionDates: sessions(8) },
      { id: 'curl', name: 'Bicep Curls', sessionDates: sessions(2, 12) },
    ]
    const order = rankLifts(rows, ctx({ latestWeekLiftIds: new Set(['back', 'curl']) })).map(
      (r) => r.id,
    )
    expect(order[0]).toBe('back')
    expect(order.indexOf('zercher')).toBeLessThan(order.indexOf('curl'))
  })

  it('a stale compound still outranks a fresh accessory', () => {
    const rows = [
      { id: 'squat', name: 'High Bar Squat', sessionDates: sessions(60, 20) },
      { id: 'raise', name: 'Lateral Raise', sessionDates: sessions(2, 10) },
    ]
    expect(rankLifts(rows, ctx()).map((r) => r.id)).toEqual(['squat', 'raise'])
  })

  it("today's lifts come first, even accessories over stale compounds", () => {
    const rows = [
      { id: 'squat', name: 'High Bar Squat', sessionDates: sessions(60, 20) },
      { id: 'raise', name: 'Lateral Raise', sessionDates: sessions(2, 10) },
    ]
    const ranked = rankLifts(
      rows,
      ctx({ todayLiftIds: new Set(['raise']), latestWeekLiftIds: new Set(['raise']) }),
    )
    expect(ranked.map((r) => r.id)).toEqual(['raise', 'squat'])
    expect(ranked[0].isToday).toBe(true)
    expect(ranked[1].isToday).toBe(false)
  })

  it('a never-done lift planned today ranks above off-program accessories', () => {
    const rows = [
      { id: 'new', name: 'Pin Squat', sessionDates: [] },
      { id: 'curl', name: 'Bicep Curls', sessionDates: sessions(3, 10) },
    ]
    const ranked = rankLifts(
      rows,
      ctx({ todayLiftIds: new Set(['new']), latestWeekLiftIds: new Set(['new']) }),
    )
    expect(ranked.map((r) => r.id)).toEqual(['new', 'curl'])
  })

  it('frequency breaks ties between otherwise-equal lifts', () => {
    const a = { id: 'a', name: 'Cable Row', sessionDates: sessions(3, 2) }
    const b = { id: 'b', name: 'Seal Row', sessionDates: sessions(3, 14) }
    expect(liftScore(b, ctx())).toBeGreaterThan(liftScore(a, ctx()))
  })
})

describe('rankLifts on the real Nov-2025 sheet', () => {
  // Build rows straight from the parsed fixture: Mon..Fri spread over the
  // last 5 days, "today" = the Thursday session (deadlift day).
  const week = parseWorkoutPaste(NOV_WEEK)[0]
  const rows = week.days.flatMap((day, di) =>
    day.exercises.map((ex) => ({
      id: `${di}:${ex.name}`,
      name: ex.name,
      sessionDates: [NOW - (week.days.length - di) * DAY],
    })),
  )
  const thursday = week.days[3]
  const rankCtx = ctx({
    todayLiftIds: new Set(thursday.exercises.map((ex) => `3:${ex.name}`)),
    latestWeekLiftIds: new Set(rows.map((r) => r.id)),
  })
  const ranked = rankLifts(rows, rankCtx)
  const names = ranked.map((r) => r.name)

  it('parses the expected day count', () => {
    expect(week.days).toHaveLength(5)
  })

  it("puts Thursday's compounds on top", () => {
    expect(names.slice(0, 2)).toEqual(
      expect.arrayContaining(['Conventional Deadlift', 'Bulgarian Split Squat']),
    )
  })

  it('ranks earlier-week compounds above same-week accessories', () => {
    expect(names.indexOf('High Bar Squat')).toBeLessThan(names.indexOf('Lat Pulldown'))
    expect(names.indexOf('Pause Bench Press')).toBeLessThan(names.indexOf('Tate Press'))
    expect(names.indexOf('Spoto Bench Press')).toBeLessThan(names.indexOf('Preacher Curl'))
  })

  it("flags today's lifts", () => {
    expect(ranked.find((r) => r.name === 'Conventional Deadlift')?.isToday).toBe(true)
    expect(ranked.find((r) => r.name === 'High Bar Squat')?.isToday).toBe(false)
  })
})
