import { describe, it, expect } from 'vitest'
import { niceScale } from './chartScale'

describe('niceScale', () => {
  it('produces nice round ticks spanning the domain', () => {
    const s = niceScale(0, 97, 5)
    expect(s.ticks).toEqual([0, 25, 50, 75, 100])
    expect(s.lo).toBe(0)
    expect(s.hi).toBe(100)
  })

  it('covers a narrow high domain', () => {
    const s = niceScale(140, 142.5, 5)
    expect(s.lo).toBeLessThanOrEqual(140)
    expect(s.hi).toBeGreaterThanOrEqual(142.5)
    expect(s.ticks.length).toBeGreaterThanOrEqual(2)
    expect(s.ticks[0]).toBe(s.lo)
    expect(s.ticks[s.ticks.length - 1]).toBe(s.hi)
  })

  it('handles a single-value domain without NaN', () => {
    const s = niceScale(100, 100, 5)
    expect(Number.isFinite(s.lo)).toBe(true)
    expect(Number.isFinite(s.hi)).toBe(true)
    expect(s.hi).toBeGreaterThan(s.lo)
    expect(s.ticks.every(Number.isFinite)).toBe(true)
  })

  it('uses 1/2/5 step multiples', () => {
    const s = niceScale(0, 7, 5)
    const step = s.ticks[1] - s.ticks[0]
    const mantissa = step / Math.pow(10, Math.floor(Math.log10(step)))
    expect([1, 2, 2.5, 5]).toContain(mantissa)
  })
})
