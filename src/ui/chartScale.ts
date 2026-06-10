export interface NiceScale {
  ticks: number[]
  lo: number
  hi: number
}

/** Round x to a "nice" number (1/2/2.5/5 × 10^n). */
function niceNum(x: number, round: boolean): number {
  const exp = Math.floor(Math.log10(x))
  const f = x / Math.pow(10, exp)
  let nf: number
  if (round) {
    if (f < 1.5) nf = 1
    else if (f < 2.2) nf = 2
    else if (f < 3.2) nf = 2.5
    else if (f < 7) nf = 5
    else nf = 10
  } else {
    if (f <= 1) nf = 1
    else if (f <= 2) nf = 2
    else if (f <= 2.5) nf = 2.5
    else if (f <= 5) nf = 5
    else nf = 10
  }
  return nf * Math.pow(10, exp)
}

/** Nice-number axis scale (Heckbert): round tick steps covering [min, max]. */
export function niceScale(min: number, max: number, maxTicks = 5): NiceScale {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { ticks: [0, 1], lo: 0, hi: 1 }
  if (min > max) [min, max] = [max, min]
  if (min === max) {
    // Degenerate domain — pad to a sensible window around the value.
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.1 : 1
    min -= pad
    max += pad
  }

  const range = niceNum(max - min, false)
  const step = niceNum(range / (maxTicks - 1), true)
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step

  const ticks: number[] = []
  // Float-safe iteration: fixed count, values rounded to the step's precision.
  const n = Math.round((hi - lo) / step)
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1)
  for (let i = 0; i <= n; i++) {
    ticks.push(Number((lo + i * step).toFixed(decimals)))
  }
  return { ticks, lo: ticks[0], hi: ticks[ticks.length - 1] }
}
