import { describe, it, expect } from 'vitest'
import { epley1RM, bestForReps, computePRs, dotsScore, isNewPR } from './prMath'
import type { SetLog } from '../data/db'

const set = (weight: number, reps: number, completedAt = 1): SetLog =>
  ({ id: String(Math.random()), exerciseId: 'e', liftId: 'l', dayId: 'd', weight, reps, completedAt, isWarmup: false, updatedAt: 1 })

describe('epley1RM', () => {
  it('returns weight itself for 1 rep', () => expect(epley1RM(100, 1)).toBe(100))
  it('estimates 5x100 as ~116.7', () => expect(epley1RM(100, 5)).toBeCloseTo(116.67, 1))
})

describe('bestForReps', () => {
  it('best weight achieved for at least N reps', () => {
    const logs = [set(140, 1), set(120, 5), set(125, 3)]
    expect(bestForReps(logs, 1)).toBe(140)
    expect(bestForReps(logs, 3)).toBe(125)
    expect(bestForReps(logs, 5)).toBe(120)
  })
  it('ignores warmups and returns null when empty', () => {
    expect(bestForReps([{ ...set(200, 5), isWarmup: true }], 5)).toBeNull()
    expect(bestForReps([], 1)).toBeNull()
  })
})

describe('computePRs', () => {
  it('returns 1/3/5RM and best estimated 1RM', () => {
    const prs = computePRs([set(140, 1), set(120, 5)])
    expect(prs.oneRM).toBe(140)
    expect(prs.fiveRM).toBe(120)
    expect(prs.est1RM).toBeCloseTo(140, 0)
  })
})

describe('isNewPR', () => {
  it('detects when a set beats prior best for its rep bracket', () => {
    const history = [set(140, 1), set(120, 5)]
    expect(isNewPR(history, set(125, 5))).toBe(true)
    expect(isNewPR(history, set(115, 5))).toBe(false)
  })
})

describe('dotsScore', () => {
  it('computes DOTS for a male lifter (known value)', () => {
    // 100kg bw, 500kg total → ~307.76 (OpenPowerlifting DOTS coefficients)
    expect(dotsScore(500, 100, 'male')).toBeGreaterThan(300)
    expect(dotsScore(500, 100, 'male')).toBeLessThan(315)
  })
})
