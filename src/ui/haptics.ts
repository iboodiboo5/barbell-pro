import { getFeedbackSettings } from './feedback'

function vibrate(pattern: number | number[]): void {
  if (!getFeedbackSettings().haptics) return
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  navigator.vibrate(pattern)
}

export const haptics = {
  /** Subtle tap — every press. */
  light(): void {
    vibrate(10)
  },
  /** Firmer tap — confirmations, steppers. */
  medium(): void {
    vibrate(20)
  },
  /** Double-pulse — set complete, PR. */
  success(): void {
    vibrate([10, 40, 20])
  },
  /** Triple-pulse — destructive / attention. */
  warning(): void {
    vibrate([30, 30, 30])
  },
}
