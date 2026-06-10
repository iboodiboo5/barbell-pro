import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import { repo } from '../../data/repo'
import { formatWeight, kgToLbs } from '../../lib/plateMath'
import { Button } from '../../ui/Button'
import { RollingNumber } from '../../ui/RollingNumber'
import type { SessionSummaryData } from './liveStore'

/** Mount at 0, spring to the target on the next frame — odometer count-up. */
function useCountUp(target: number): number {
  const [v, setV] = useState(0)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setV(target))
    return () => cancelAnimationFrame(raf)
  }, [target])
  return v
}

function Stat({
  label,
  value,
  decimals = 0,
  suffix,
  gold,
}: {
  label: string
  value: number
  decimals?: number
  suffix?: string
  gold?: boolean
}) {
  const v = useCountUp(value)
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '18px 8px',
        borderRadius: 'var(--radius-card)',
        background: 'var(--surface)',
        border: `1px solid ${gold ? 'var(--gold)' : 'var(--border)'}`,
      }}
    >
      <span
        style={{
          fontSize: 30,
          fontWeight: 800,
          letterSpacing: '-0.02em',
          color: gold ? 'var(--gold)' : 'var(--text)',
          display: 'inline-flex',
          alignItems: 'baseline',
        }}
      >
        <RollingNumber value={v} decimals={decimals} />
        {suffix && <span style={{ fontSize: 14, fontWeight: 700, marginLeft: 3 }}>{suffix}</span>}
      </span>
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
        {label}
      </span>
    </div>
  )
}

interface SessionSummaryProps {
  summary: SessionSummaryData
  onDone: () => void
}

export function SessionSummary({ summary, onDone }: SessionSummaryProps) {
  const settings = useLiveQuery(() => repo.getSettings(), [])
  const units = settings?.units ?? 'kg'

  const liftNames = useLiveQuery(async () => {
    const ids = [...new Set(summary.prSets.map((s) => s.liftId))]
    const lifts = await db.lifts.bulkGet(ids)
    return new Map(lifts.filter((l) => l !== undefined).map((l) => [l.id, l.name]))
  }, [summary])

  const durationMin = Math.floor(summary.durationMs / 60000)
  const durationSec = Math.floor((summary.durationMs % 60000) / 1000)
  const durationMinUp = useCountUp(durationMin)
  const volume = units === 'kg' ? summary.totalVolume : kgToLbs(summary.totalVolume)

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
        padding: 'calc(18px + var(--safe-top)) 20px calc(20px + var(--safe-bottom))',
        overflowY: 'auto',
      }}
    >
      <motion.h1
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 20 }}
        style={{
          margin: '18px 0 26px',
          textAlign: 'center',
          fontSize: 30,
          fontWeight: 800,
          letterSpacing: '-0.02em',
          color: 'var(--text)',
        }}
      >
        Workout complete
      </motion.h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div
          style={{
            gridColumn: '1 / -1',
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'center',
            gap: 6,
            padding: '20px 8px',
            borderRadius: 'var(--radius-card)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          <span style={{ fontSize: 40, fontWeight: 800, color: 'var(--text)', display: 'inline-flex', alignItems: 'baseline' }}>
            <RollingNumber value={durationMinUp} />
            :
            <RollingNumber value={durationSec} pad={2} />
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
            duration
          </span>
        </div>
        <Stat label={`volume (${units})`} value={Math.round(volume)} />
        <Stat label="sets" value={summary.setCount} />
        <div style={{ gridColumn: '1 / -1' }}>
          <Stat label="personal records" value={summary.prCount} gold={summary.prCount > 0} />
        </div>
      </div>

      {summary.prSets.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div style={{ margin: '0 4px 10px', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gold)' }}>
            New PRs
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {summary.prSets.map((s, i) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + i * 0.08, type: 'spring', stiffness: 320, damping: 26 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderRadius: 14,
                  background: 'var(--surface)',
                  border: '1px solid var(--gold)',
                  boxShadow: '0 0 18px var(--gold-soft)',
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                  {liftNames?.get(s.liftId) ?? '…'}
                </span>
                <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--gold)', fontVariantNumeric: 'tabular-nums' }}>
                  {formatWeight(s.weight, units)} × {s.reps}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      <div style={{ flex: 1 }} />
      <Button fullWidth onClick={onDone} style={{ marginTop: 24 }}>
        Done
      </Button>
    </motion.div>
  )
}
