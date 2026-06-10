import { useState } from 'react'
import { motion } from 'motion/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import type { SetLog } from '../../data/db'
import { repo } from '../../data/repo'
import { computePRs } from '../../lib/prMath'
import { formatWeight } from '../../lib/plateMath'
import { useNavStore } from '../../navStore'
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

interface LiftRow {
  id: string
  name: string
  aliases: string[]
  est1RM: number | null
  lastDone: number | null
}

export function LiftsTab() {
  const openLift = useNavStore((s) => s.openLift)
  const [query, setQuery] = useState('')

  const settings = useLiveQuery(() => repo.getSettings(), [])
  const units = settings?.units ?? 'kg'

  const rows = useLiveQuery(async (): Promise<LiftRow[]> => {
    const [lifts, logs, exercises] = await Promise.all([
      db.lifts.toArray(),
      db.setLogs.toArray(),
      db.exercises.toArray(),
    ])
    const programLiftIds = new Set(exercises.map((e) => e.liftId))
    const logsByLift = new Map<string, SetLog[]>()
    for (const log of logs) {
      const list = logsByLift.get(log.liftId) ?? []
      list.push(log)
      logsByLift.set(log.liftId, list)
    }
    return lifts
      .filter((l) => logsByLift.has(l.id) || programLiftIds.has(l.id))
      .map((l) => {
        const liftLogs = logsByLift.get(l.id) ?? []
        return {
          id: l.id,
          name: l.name,
          aliases: l.aliases,
          est1RM: computePRs(liftLogs).est1RM,
          lastDone: liftLogs.length ? Math.max(...liftLogs.map((s) => s.completedAt)) : null,
        }
      })
      .sort((a, b) => (b.lastDone ?? 0) - (a.lastDone ?? 0))
  }, [])

  const q = query.trim().toLowerCase()
  const filtered = (rows ?? []).filter(
    (r) =>
      q === '' ||
      r.name.toLowerCase().includes(q) ||
      r.aliases.some((a) => a.includes(q)),
  )

  return (
    <div style={{ paddingTop: 8 }}>
      <header style={{ padding: '8px 20px 14px' }}>
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em' }}>Lifts</h1>
      </header>

      <div style={{ padding: '0 20px 14px' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search lifts"
          aria-label="Search lifts"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '11px 16px',
            borderRadius: 14,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            fontSize: 15,
            fontWeight: 600,
            outline: 'none',
          }}
        />
      </div>

      {rows && filtered.length === 0 ? (
        <div
          style={{
            padding: '56px 32px',
            textAlign: 'center',
            color: 'var(--text-dim)',
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          {q === '' ? 'Lifts appear here once you log sets or plan exercises.' : 'No lifts match.'}
        </div>
      ) : (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.04 } } }}
          style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 20px' }}
        >
          {filtered.map((r) => (
            <motion.div
              key={r.id}
              variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            >
              <PressScale
                onClick={() => openLift(r.id)}
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
        </motion.div>
      )}
    </div>
  )
}
