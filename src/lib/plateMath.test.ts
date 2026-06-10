import { describe, it, expect } from 'vitest'
import { computePlates, kgToLbs, lbsToKg, formatWeight } from './plateMath'

const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25]

describe('computePlates', () => {
  it('loads 140kg on a 20kg bar as 2x25,1x10 per side... greedy', () => {
    const r = computePlates(140, 20, PLATES)
    expect(r.perSide).toEqual([25, 25, 10])
    expect(r.achieved).toBe(140)
    expect(r.remainder).toBe(0)
  })
  it('reports remainder when target unreachable exactly', () => {
    const r = computePlates(141, 20, PLATES)
    expect(r.achieved).toBe(140)
    expect(r.remainder).toBeCloseTo(1)
  })
  it('handles target below bar weight', () => {
    const r = computePlates(15, 20, PLATES)
    expect(r.perSide).toEqual([])
    expect(r.achieved).toBe(20)
    expect(r.remainder).toBe(0)
  })
  it('does not mutate the plates input array', () => {
    const plates = [25, 20, 15, 10, 5, 2.5, 1.25]
    const original = [...plates]
    computePlates(100, 20, plates)
    expect(plates).toEqual(original)
  })
  it('handles 2.5+1.25 combos (float edge case)', () => {
    // bar=20, target=25 → perSideTarget=2.5 → [2.5]
    const r = computePlates(25, 20, PLATES)
    expect(r.perSide).toEqual([2.5])
    expect(r.achieved).toBe(25)
    expect(r.remainder).toBe(0)
  })
  it('handles 1.25 plate combos (float edge case)', () => {
    // bar=20, target=22.5 → perSideTarget=1.25 → [1.25]
    const r = computePlates(22.5, 20, PLATES)
    expect(r.perSide).toEqual([1.25])
    expect(r.achieved).toBe(22.5)
    expect(r.remainder).toBe(0)
  })
})

describe('unit conversion', () => {
  it('round-trips kg↔lbs', () => expect(lbsToKg(kgToLbs(100))).toBeCloseTo(100))
})

describe('formatWeight', () => {
  it('formats kg with unit', () => {
    expect(formatWeight(140, 'kg')).toBe('140 kg')
  })
  it('converts to lbs and formats', () => {
    expect(formatWeight(100, 'lbs')).toBe('220.5 lbs')
  })
  it('formats fractional kg, strips trailing .0', () => {
    expect(formatWeight(102.5, 'kg')).toBe('102.5 kg')
  })
  it('strips trailing .0 for whole numbers in lbs display', () => {
    // 0kg → 0 lbs
    expect(formatWeight(0, 'kg')).toBe('0 kg')
  })
  it('strips trailing .0 suffix in kg', () => {
    expect(formatWeight(20, 'kg')).toBe('20 kg')
  })
})
