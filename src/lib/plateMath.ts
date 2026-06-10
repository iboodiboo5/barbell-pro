export interface PlateResult {
  perSide: number[]
  achieved: number
  remainder: number
}

/**
 * Greedy plate calculator. Given a target barbell weight, computes which plates
 * to load on each side of the bar. Weights are in kg. Input array is not mutated.
 */
export function computePlates(
  targetKg: number,
  barWeightKg: number,
  platesKg: number[],
): PlateResult {
  if (targetKg <= barWeightKg) {
    return { perSide: [], achieved: barWeightKg, remainder: 0 }
  }

  const perSideTarget = (targetKg - barWeightKg) / 2
  // Sort a copy descending; do not mutate the input
  const sorted = [...platesKg].sort((a, b) => b - a)

  const perSide: number[] = []
  let remaining = perSideTarget

  for (const plate of sorted) {
    while (remaining >= plate - 0.001) {
      perSide.push(plate)
      remaining -= plate
    }
  }

  const achieved = barWeightKg + 2 * perSide.reduce((sum, p) => sum + p, 0)
  const remainder = Math.max(0, targetKg - achieved)

  return { perSide, achieved, remainder }
}

/** Convert kilograms to pounds. */
export const kgToLbs = (kg: number): number => kg * 2.20462

/** Convert pounds to kilograms. */
export const lbsToKg = (lbs: number): number => lbs / 2.20462

/**
 * Format a weight value for display.
 * When units='lbs', converts from kg first.
 * Renders with at most 1 decimal place, strips trailing ".0".
 */
export function formatWeight(kg: number, units: 'kg' | 'lbs'): string {
  const value = units === 'lbs' ? kgToLbs(kg) : kg
  // Round to 1 decimal
  const rounded = Math.round(value * 10) / 10
  // Strip trailing .0
  const str = rounded % 1 === 0 ? String(rounded | 0) : rounded.toFixed(1)
  return `${str} ${units}`
}
