import { describe, it, expect } from 'vitest'
import { weeklyConsistency } from './consistency'

// Reference dates: 2026-06-01 and 2026-06-08 are Mondays; 2026-06-11 is a Thursday.

describe('weeklyConsistency', () => {
  it('weeks are Monday-based', () => {
    // 2026-06-07 is a Sunday → belongs to the week starting Mon 2026-06-01
    const r = weeklyConsistency(['2026-06-07'], '2026-06-01', 1, '2026-06-11')
    expect(r.weeks[0].weekStart).toBe('2026-06-01')
    expect(r.weeks[0].sessions).toBe(1)
    expect(r.weeks[0].met).toBe(true)
  })

  it('counts streak across consecutive met weeks (current week met early)', () => {
    const r = weeklyConsistency(
      ['2026-06-01', '2026-06-03', '2026-06-08', '2026-06-10'],
      '2026-06-01', 2, '2026-06-11',
    )
    expect(r.weeks).toHaveLength(2)
    expect(r.currentStreak).toBe(2)
  })

  it('a gap week breaks the streak', () => {
    const r = weeklyConsistency(
      ['2026-05-18', '2026-05-20', '2026-06-08', '2026-06-10'],
      '2026-05-18', 2, '2026-06-11',
    )
    // met, unmet, unmet, met(current) → streak restarts at 1
    expect(r.currentStreak).toBe(1)
  })

  it('an unfinished current week does not break the streak', () => {
    const r = weeklyConsistency(['2026-06-01', '2026-06-03'], '2026-06-01', 2, '2026-06-11')
    // previous week met, current week 0 sessions but still in progress → streak 1
    expect(r.currentStreak).toBe(1)
  })

  it('duplicate same-day sessions count once', () => {
    const r = weeklyConsistency(['2026-06-08', '2026-06-08'], '2026-06-08', 2, '2026-06-11')
    expect(r.weeks[0].sessions).toBe(1)
  })

  it('empty input → streak 0, weeks still enumerated', () => {
    const r = weeklyConsistency([], '2026-06-01', 3, '2026-06-11')
    expect(r.currentStreak).toBe(0)
    expect(r.weeks).toHaveLength(2)
    expect(r.weeks.every((w) => !w.met)).toBe(true)
  })
})
