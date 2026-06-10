import { motion } from 'motion/react'
import { RollingNumber } from '../../ui/RollingNumber'
import type { WeekConsistency } from './consistency'

const SHOWN_WEEKS = 8

function Flame({ lit }: { lit: boolean }) {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill={lit ? 'var(--gold)' : 'var(--text-faint)'} aria-hidden="true" style={lit ? { filter: 'drop-shadow(0 0 8px var(--gold-soft))' } : undefined}>
      <path d="M12 2c.7 2.5-.2 4.2-1.6 5.8C9 9.4 7.5 11 7.5 13.6A4.8 4.8 0 0 0 12 18.4a4.8 4.8 0 0 0 4.5-4.8c0-1.3-.4-2.3-1-3.3-.3.8-.8 1.4-1.6 1.8.4-3.2-.5-7.2-1.9-10.1zM12 22c-4.4 0-8-3.4-8-8.4 0-3.4 1.9-5.6 3.5-7.4C9.1 4.4 10.4 3 10.5.6c0-.3.3-.6.6-.6h.8c.3 0 .5.2.6.4 1.9 3.5 3.2 8 3 11.3.5-.5.9-1.2 1.1-2 .1-.3.4-.5.7-.4.2 0 .4.2.5.4 1.4 1.7 2.2 3.5 2.2 5.9 0 5-3.6 8.4-8 8.4z" />
    </svg>
  )
}

interface ConsistencyGridProps {
  weeks: WeekConsistency[]
  streak: number
  targetPerWeek: number
}

/** Streak hero number over a per-week dot grid (filled dot = one session). */
export function ConsistencyGrid({ weeks, streak, targetPerWeek }: ConsistencyGridProps) {
  const shown = weeks.slice(-SHOWN_WEEKS).reverse() // newest row first

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Flame lit={streak >= 1} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span
            style={{
              fontSize: 34,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: streak >= 1 ? 'var(--gold)' : 'var(--text)',
              lineHeight: 1.1,
            }}
          >
            <RollingNumber value={streak} />
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
            week streak
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {shown.map((w, rowIdx) => {
          const slots = Math.max(targetPerWeek, Math.min(w.sessions, 7))
          const label = new Date(w.weekStart).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
          return (
            <div key={w.weekStart} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 52, fontSize: 12, fontWeight: 600, color: 'var(--text-faint)', flexShrink: 0 }}>
                {rowIdx === 0 ? 'This wk' : label}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                {Array.from({ length: slots }, (_, i) => {
                  const filled = i < w.sessions
                  return (
                    <motion.span
                      key={i}
                      initial={{ scale: 0 }}
                      whileInView={{ scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: rowIdx * 0.05 + i * 0.04, type: 'spring', stiffness: 420, damping: 22 }}
                      style={{
                        width: 13,
                        height: 13,
                        borderRadius: '50%',
                        background: filled ? (w.met ? 'var(--success)' : 'var(--accent)') : 'var(--surface-2)',
                        border: `1px solid ${filled ? 'transparent' : 'var(--border-strong)'}`,
                      }}
                    />
                  )
                })}
              </div>
              {w.met && (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-label="Target met">
                  <path d="M4 12.5l5.5 5.5L20 7" />
                </svg>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
