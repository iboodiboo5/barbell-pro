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

// ─── mixed-unit plate stacks (interactive calculator) ───────────────────────

/** One physical plate on the bar (per side). */
export interface PlateSel { value: number; unit: 'kg' | 'lb' }

export const KG_PER_LB = 0.45359237

/** Standard lb denominations for mixed-plate gyms. */
export const LB_PLATES = [45, 35, 25, 10, 5, 2.5]

export const plateToKg = (p: PlateSel): number =>
  p.unit === 'lb' ? p.value * KG_PER_LB : p.value

/** Bar + 2 × per-side kg-equivalents. */
export function stackTotalKg(barWeightKg: number, perSide: PlateSel[]): number {
  return barWeightKg + 2 * perSide.reduce((s, p) => s + plateToKg(p), 0)
}

/** Greedy kg suggestion for a target, as an editable stack. */
export function autoStack(targetKg: number, barWeightKg: number, platesKg: number[]): PlateSel[] {
  return computePlates(targetKg, barWeightKg, platesKg).perSide
    .map((value) => ({ value, unit: 'kg' as const }))
}

/** New stack with `plate` inserted, kept heaviest-first by kg-equivalent. */
export function insertPlate(perSide: PlateSel[], plate: PlateSel): PlateSel[] {
  const out = [...perSide]
  const kg = plateToKg(plate)
  const i = out.findIndex((p) => plateToKg(p) < kg)
  out.splice(i === -1 ? out.length : i, 0, plate)
  return out
}

/** New stack with the first plate matching value+unit removed. */
export function removePlate(perSide: PlateSel[], plate: PlateSel): PlateSel[] {
  const i = perSide.findIndex((p) => p.value === plate.value && p.unit === plate.unit)
  return i === -1 ? [...perSide] : [...perSide.slice(0, i), ...perSide.slice(i + 1)]
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
