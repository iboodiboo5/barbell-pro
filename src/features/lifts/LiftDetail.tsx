import { useMemo } from 'react'
import { animate, motion, useMotionValue } from 'motion/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import type { SetLog } from '../../data/db'
import { repo } from '../../data/repo'
import { computePRs, epley1RM, isNewPR } from '../../lib/prMath'
import { formatWeight, kgToLbs } from '../../lib/plateMath'
import { useNavStore } from '../../navStore'
import { PressScale } from '../../ui/PressScale'
import { RollingNumber } from '../../ui/RollingNumber'
import { LineChart } from '../../ui/LineChart'
import { haptics } from '../../ui/haptics'

const DISMISS_SPRING = { type: 'spring', stiffness: 400, damping: 40 } as const

function PRCard({ label, valueKg, units }: { label: string; valueKg: number | null; units: 'kg' | 'lbs' }) {
  const display = valueKg === null ? null : Math.round((units === 'kg' ? valueKg : kgToLbs(valueKg)) * 10) / 10
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        padding: '12px 4px',
        borderRadius: 16,
        background: 'var(--surface)',
        border: `1px solid ${valueKg !== null ? 'var(--gold)' : 'var(--border)'}`,
        boxShadow: valueKg !== null ? '0 0 14px var(--gold-soft)' : undefined,
      }}
    >
      <span
        style={{
          fontSize: 17,
          fontWeight: 800,
          color: valueKg !== null ? 'var(--gold)' : 'var(--text-faint)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {display !== null ? <RollingNumber value={display} decimals={display % 1 !== 0 ? 1 : 0} /> : '—'}
      </span>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
        {label}
      </span>
    </div>
  )
}

/** Slide-over layer with PR cards, est-1RM chart, and full session history. */
export function LiftDetail({ liftId }: { liftId: string }) {
  const closeLift = useNavStore((s) => s.closeLift)

  const lift = useLiveQuery(() => db.lifts.get(liftId), [liftId])
  const settings = useLiveQuery(() => repo.getSettings(), [])
  const units = settings?.units ?? 'kg'

  const logs = useLiveQuery(
    () => db.setLogs.where('liftId').equals(liftId).toArray(),
    [liftId],
  )

  const { prs, sessions, chartPoints, prSetIds } = useMemo(() => {
    const sorted = (logs ?? []).slice().sort((a, b) => a.completedAt - b.completedAt)
    const prs = computePRs(sorted)

    // Replay history to mark the sets that established a PR when logged.
    const prSetIds = new Set<string>()
    const seen: SetLog[] = []
    for (const s of sorted) {
      if (isNewPR(seen, s)) prSetIds.add(s.id)
      seen.push(s)
    }

    // Group into sessions by calendar date (newest first for the list).
    const byDate = new Map<string, SetLog[]>()
    for (const s of sorted) {
      const key = new Date(s.completedAt).toDateString()
      const list = byDate.get(key) ?? []
      list.push(s)
      byDate.set(key, list)
    }
    const sessions = [...byDate.values()].sort(
      (a, b) => b[0].completedAt - a[0].completedAt,
    )

    // Chart: best estimated 1RM per session, oldest → newest.
    const chartPoints = [...byDate.values()]
      .map((sets) => {
        const working = sets.filter((s) => !s.isWarmup)
        if (working.length === 0) return null
        const best = Math.max(...working.map((s) => epley1RM(s.weight, s.reps)))
        const at = sets[0].completedAt
        return {
          x: at,
          y: Math.round(best * 10) / 10,
          label: new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
        }
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .sort((a, b) => a.x - b.x)

    return { prs, sessions, chartPoints, prSetIds }
  }, [logs])

  // drag-right to dismiss
  const x = useMotionValue(0)

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={DISMISS_SPRING}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0.02, right: 0.7 }}
      dragMomentum={false}
      onDragEnd={(_, info) => {
        if (info.offset.x > 110 || info.velocity.x > 600) closeLift()
        else animate(x, 0, DISMISS_SPRING)
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'var(--bg)',
        overflowY: 'auto',
        paddingTop: 'var(--safe-top)',
        paddingBottom: 'calc(24px + var(--safe-bottom))',
        touchAction: 'pan-y',
        x,
      }}
    >
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 8px' }}>
        <PressScale
          onClick={() => {
            haptics.light()
            closeLift()
          }}
          aria-label="Back"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--text-dim)',
            flexShrink: 0,
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 19l-7-7 7-7" />
          </svg>
        </PressScale>
        <h1
          style={{
            margin: 0,
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {lift?.name ?? ''}
        </h1>
      </div>

      {/* PR cards */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 16px 4px' }}>
        <PRCard label="1RM" valueKg={prs.oneRM} units={units} />
        <PRCard label="3RM" valueKg={prs.threeRM} units={units} />
        <PRCard label="5RM" valueKg={prs.fiveRM} units={units} />
        <PRCard label="est 1RM" valueKg={prs.est1RM} units={units} />
      </div>

      {/* est-1RM trend */}
      {chartPoints.length > 0 && (
        <div
          style={{
            margin: '14px 16px 0',
            padding: '16px 12px 8px',
            borderRadius: 'var(--radius-card)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ margin: '0 6px 10px', fontSize: 12, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
            Estimated 1RM
          </div>
          <LineChart
            points={chartPoints}
            height={170}
            formatY={(n) => formatWeight(units === 'kg' ? n : Math.round(kgToLbs(n)), units).replace(` ${units}`, '')}
          />
        </div>
      )}

      {/* history */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ margin: '0 4px 10px', fontSize: 12, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
          History
        </div>
        {sessions.length === 0 ? (
          <div style={{ padding: '24px 8px', color: 'var(--text-dim)', fontSize: 14, fontWeight: 600 }}>
            No sets logged yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sessions.map((sets) => (
              <div
                key={sets[0].completedAt}
                style={{
                  borderRadius: 'var(--radius-card)',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  padding: '12px 16px',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 8 }}>
                  {new Date(sets[0].completedAt).toLocaleDateString(undefined, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {sets.map((s, i) => (
                    <div
                      key={s.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 14,
                        fontWeight: 600,
                      }}
                    >
                      <span style={{ color: 'var(--text-faint)' }}>
                        {s.isWarmup ? 'Warmup' : `Set ${i + 1}`}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                        {formatWeight(s.weight, units)} × {s.reps}
                        {prSetIds.has(s.id) && (
                          <span
                            aria-label="Personal record set"
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: 'var(--gold)',
                              boxShadow: '0 0 7px var(--gold)',
                              flexShrink: 0,
                            }}
                          />
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}
