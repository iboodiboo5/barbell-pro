import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { PressScale } from '../../ui/PressScale'
import { ProgressRing } from '../../ui/ProgressRing'
import { RollingNumber } from '../../ui/RollingNumber'
import { haptics } from '../../ui/haptics'
import { sound } from '../../ui/sound'
import { useLiveStore } from './liveStore'

/**
 * Floating rest countdown. Wall-clock: the store holds only restEndsAt (an
 * epoch timestamp); this component re-derives remaining time every 250ms —
 * never a decrementing counter, so backgrounding the tab can't drift it.
 */
export function RestTimer() {
  const restEndsAt = useLiveStore((s) => s.restEndsAt)
  const adjustRest = useLiveStore((s) => s.adjustRest)
  const clearRest = useLiveStore((s) => s.clearRest)

  const [remainingMs, setRemainingMs] = useState(0)
  // Total duration of the current rest (for the ring fraction). Tracks the
  // start of each rest period and follows ±15s adjustments.
  const startRef = useRef<number | null>(null)
  const prevEndsAt = useRef<number | null>(null)

  useEffect(() => {
    if (restEndsAt === null) {
      startRef.current = null
      prevEndsAt.current = null
      return
    }
    // New rest period (was idle) → remember its start for the ring fraction.
    if (prevEndsAt.current === null) startRef.current = Date.now()
    prevEndsAt.current = restEndsAt

    setRemainingMs(Math.max(0, restEndsAt - Date.now()))
    const id = setInterval(() => {
      const left = Math.max(0, restEndsAt - Date.now())
      setRemainingMs(left)
      if (left === 0) {
        clearInterval(id)
        sound.timerDone()
        haptics.warning()
        // brief hold at 0:00 before auto-hiding
        setTimeout(() => {
          if (useLiveStore.getState().restEndsAt === restEndsAt) clearRest()
        }, 900)
      }
    }, 250)
    return () => clearInterval(id)
  }, [restEndsAt, clearRest])

  const totalMs = restEndsAt !== null && startRef.current !== null
    ? Math.max(1, restEndsAt - startRef.current)
    : 1
  const remainingSec = Math.ceil(remainingMs / 1000)
  const mins = Math.floor(remainingSec / 60)
  const secs = remainingSec % 60

  return (
    <AnimatePresence>
      {restEndsAt !== null && (
        <motion.div
          initial={{ y: 90, opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 90, opacity: 0, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 'calc(16px + var(--safe-bottom))',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '12px 16px',
            borderRadius: 22,
            background: 'var(--surface-2)',
            border: '1px solid var(--border-strong)',
            boxShadow: '0 12px 36px rgba(0, 0, 0, .5)',
          }}
        >
          <ProgressRing progress={remainingMs / totalMs} size={64} stroke={5}>
            <span
              style={{
                fontSize: 15,
                fontWeight: 800,
                fontVariantNumeric: 'tabular-nums',
                color: remainingMs === 0 ? 'var(--success)' : 'var(--text)',
                display: 'inline-flex',
                alignItems: 'baseline',
              }}
            >
              <RollingNumber value={mins} />
              :
              <RollingNumber value={secs} pad={2} />
            </span>
          </ProgressRing>

          <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-dim)' }}>
            {remainingMs === 0 ? 'Rest done — go!' : 'Resting'}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PressScale
              onClick={() => { haptics.light(); sound.tick(); adjustRest(-15) }}
              aria-label="Shorten rest by 15 seconds"
              style={{
                padding: '8px 12px',
                borderRadius: 12,
                background: 'var(--surface)',
                border: '1px solid var(--border-strong)',
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--text)',
              }}
            >
              −15
            </PressScale>
            <PressScale
              onClick={() => { haptics.light(); sound.tick(); adjustRest(15) }}
              aria-label="Extend rest by 15 seconds"
              style={{
                padding: '8px 12px',
                borderRadius: 12,
                background: 'var(--surface)',
                border: '1px solid var(--border-strong)',
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--text)',
              }}
            >
              +15
            </PressScale>
            <PressScale
              onClick={() => { haptics.light(); clearRest() }}
              aria-label="Skip rest"
              style={{
                padding: '8px 12px',
                borderRadius: 12,
                background: 'var(--accent-soft)',
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--accent)',
              }}
            >
              Skip
            </PressScale>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
