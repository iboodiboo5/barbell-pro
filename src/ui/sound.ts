import { getFeedbackSettings } from './feedback'

// One lazy AudioContext for the whole app, created on first call.
// All sound.* calls originate from user interactions, so autoplay policy is satisfied.
let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** Schedule one synthesized note. Offsets/durations in seconds. */
function note(
  ac: AudioContext,
  freq: number,
  type: OscillatorType,
  offset: number,
  dur: number,
  gain: number,
): void {
  const t0 = ac.currentTime + offset
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.value = freq
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g)
  g.connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

export const sound = {
  /** Soft UI tick — sine 880Hz, 40ms. */
  tick(): void {
    if (!getFeedbackSettings().sound) return
    const ac = getCtx()
    if (!ac) return
    note(ac, 880, 'sine', 0, 0.04, 0.04)
  },

  /** Set complete — two-note C5→G5 triangle, ~120ms. */
  complete(): void {
    if (!getFeedbackSettings().sound) return
    const ac = getCtx()
    if (!ac) return
    note(ac, 523.25, 'triangle', 0, 0.06, 0.06)
    note(ac, 783.99, 'triangle', 0.06, 0.09, 0.06)
  },

  /** Rest timer done — three pulses 660Hz square. */
  timerDone(): void {
    if (!getFeedbackSettings().sound) return
    const ac = getCtx()
    if (!ac) return
    for (let i = 0; i < 3; i++) note(ac, 660, 'square', i * 0.18, 0.1, 0.08)
  },

  /** PR fanfare — rising arpeggio C5-E5-G5-C6 triangle, ~320ms. */
  pr(): void {
    if (!getFeedbackSettings().sound) return
    const ac = getCtx()
    if (!ac) return
    const arpeggio = [523.25, 659.25, 783.99, 1046.5]
    arpeggio.forEach((freq, i) => note(ac, freq, 'triangle', i * 0.08, 0.14, 0.06))
  },
}
