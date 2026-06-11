import { motion } from 'motion/react'
import { formatWeight } from '../../lib/plateMath'
import { PressScale } from '../../ui/PressScale'

/** "today" / "yesterday" / "5d ago" / "3w ago" / "Jan 2026". */
export function relativeDate(ts: number, now = Date.now()): string {
  const startOfDay = (t: number) => {
    const d = new Date(t)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  const days = Math.round((startOfDay(now) - startOfDay(ts)) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 60) return `${Math.floor(days / 7)}w ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

export interface LiftListRow {
  id: string
  name: string
  est1RM: number | null
  lastDone: number | null
  /** Planned in today's (startable / live) workout — shows the tag. */
  isToday: boolean
}

/**
 * Ranked lift list with the scroll-pop reveal: rows spring in with a scale
 * overshoot as they enter the viewport, lightly staggered.
 */
export function LiftList({
  rows,
  units,
  onOpen,
}: {
  rows: LiftListRow[]
  units: 'kg' | 'lbs'
  onOpen: (id: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r, i) => (
        <motion.div
          key={r.id}
          initial={{ opacity: 0, y: 16, scale: 0.9 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, amount: 0.25 }}
          // low damping on purpose: the scale overshoots ~1.02 then settles (the "pop")
          transition={{ type: 'spring', stiffness: 420, damping: 17, delay: Math.min(i * 0.04, 0.3) }}
          style={{ transformOrigin: '50% 80%' }}
        >
          <PressScale
            onClick={() => onOpen(r.id)}
            aria-label={`Open ${r.name} history`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '14px 16px',
              borderRadius: 'var(--radius-card)',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: 'var(--text)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {r.name}
                </span>
                {r.isToday && (
                  <span
                    style={{
                      flexShrink: 0,
                      padding: '2px 7px',
                      borderRadius: 6,
                      background: 'var(--accent-soft)',
                      color: 'var(--accent)',
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Today
                  </span>
                )}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)' }}>
                {r.est1RM !== null
                  ? `est 1RM ${formatWeight(Math.round(r.est1RM * 10) / 10, units)}`
                  : 'planned — no sets yet'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {r.lastDone !== null && (
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-faint)' }}>
                  {relativeDate(r.lastDone)}
                </span>
              )}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </PressScale>
        </motion.div>
      ))}
    </div>
  )
}
