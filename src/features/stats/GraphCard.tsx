import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import type { BodyWeightEntry, Lift, SetLog } from '../../data/db'
import { formatWeight } from '../../lib/plateMath'
import { epley1RM } from '../../lib/prMath'
import { dotsScore } from '../../lib/prMath'
import { LineChart, type ChartPoint, type ChartSeries } from '../../ui/LineChart'
import { RollingNumber } from '../../ui/RollingNumber'
import { Button } from '../../ui/Button'
import { haptics } from '../../ui/haptics'
import {
  bodyweightSeries,
  dotsSeries,
  filterRange,
  liftMetricSeries,
  METRICS,
  RANGES,
  sbdKeyword,
  weeklyVolumeSeries,
  type MetricId,
  type Range,
} from './metrics'
import { LogWeightSheet } from './LogWeightSheet'

/** Line/chip colors assigned by selection order (all existing tokens). */
export const SERIES_COLORS = ['var(--accent)', 'var(--gold)', 'var(--success)', 'var(--danger)']
export const MAX_OVERLAY_LIFTS = SERIES_COLORS.length

export interface StatData {
  logs: SetLog[]
  logsByLift: Map<string, SetLog[]>
  lifts: Lift[]
  bodyWeights: BodyWeightEntry[]
}

export interface ChipLift {
  id: string
  name: string
}

interface GraphCardProps {
  cardIndex: number
  title: string
  metricIds: MetricId[]
  active: MetricId | null
  onSelect: (m: MetricId) => void
  /** Metric currently being dragged anywhere (dims its source pill). */
  draggingId: MetricId | null
  /** Long-press fired on a pill: hand the drag off to the page layer. */
  onPillLongPress: (m: MetricId, cardIndex: number, rect: DOMRect, point: { x: number; y: number }) => void
  registerRail: (cardIndex: number, el: HTMLDivElement | null) => void
  data: StatData
  /** Ranked lifts for the overlay chips (already sorted by relevance). */
  rankedLifts: ChipLift[]
  units: 'kg' | 'lbs'
  sex: 'male' | 'female'
}

const LONG_PRESS_MS = 350

/** Metric pill with long-press-to-drag detection (tap still selects). */
function MetricPill({
  metric,
  active,
  dimmed,
  onTap,
  onLongPress,
}: {
  metric: MetricId
  active: boolean
  dimmed: boolean
  onTap: () => void
  onLongPress: (rect: DOMRect, point: { x: number; y: number }) => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const timer = useRef<number | null>(null)
  const origin = useRef({ x: 0, y: 0 })
  const fired = useRef(false)

  const clear = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }
  useEffect(() => clear, [])

  return (
    <button
      ref={ref}
      data-pill={metric}
      onPointerDown={(e) => {
        origin.current = { x: e.clientX, y: e.clientY }
        fired.current = false
        clear()
        const point = { x: e.clientX, y: e.clientY }
        timer.current = window.setTimeout(() => {
          timer.current = null
          fired.current = true
          const rect = ref.current?.getBoundingClientRect()
          if (rect) onLongPress(rect, point)
        }, LONG_PRESS_MS)
      }}
      onPointerMove={(e) => {
        if (timer.current === null) return
        const dx = e.clientX - origin.current.x
        const dy = e.clientY - origin.current.y
        if (dx * dx + dy * dy > 100) clear()
      }}
      onPointerUp={clear}
      onPointerCancel={clear}
      onPointerLeave={clear}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        if (fired.current) {
          e.preventDefault()
          fired.current = false
          return
        }
        onTap()
      }}
      aria-pressed={active}
      style={{
        position: 'relative',
        flexShrink: 0,
        padding: '6px 13px',
        border: 'none',
        background: 'none',
        borderRadius: 9,
        fontSize: 12,
        fontWeight: 700,
        color: active ? 'var(--text)' : 'var(--text-dim)',
        cursor: 'pointer',
        opacity: dimmed ? 0.25 : 1,
        WebkitTouchCallout: 'none',
        touchAction: 'pan-x',
      }}
    >
      {active && (
        <motion.span
          layoutId={`graph-pill-${metric}`}
          transition={{ type: 'spring', stiffness: 550, damping: 40 }}
          style={{ position: 'absolute', inset: 0, borderRadius: 9, background: 'var(--accent)' }}
        />
      )}
      <span style={{ position: 'relative' }}>{METRICS[metric].label}</span>
    </button>
  )
}

/** Pick a default lift overlay: one squat, one bench, one deadlift, else top ranked. */
export function defaultLiftSelection(ranked: ChipLift[]): string[] {
  const picks: string[] = []
  for (const kw of ['squat', 'bench', 'deadlift'] as const) {
    const hit = ranked.find((r) => sbdKeyword(r.name) === kw && !picks.includes(r.id))
    if (hit) picks.push(hit.id)
  }
  if (picks.length === 0 && ranked.length > 0) picks.push(ranked[0].id)
  return picks
}

/**
 * One Profile graph card: a rail of draggable metric pills, a time-range row,
 * a contextual header stat, and the chart for the active metric. Lift-kind
 * metrics overlay up to four lifts picked via colored chips.
 */
export function GraphCard({
  cardIndex,
  title,
  metricIds,
  active,
  onSelect,
  draggingId,
  onPillLongPress,
  registerRail,
  data,
  rankedLifts,
  units,
  sex,
}: GraphCardProps) {
  const now = Date.now()
  const [range, setRange] = useState<Range>('all')
  const [selectedLifts, setSelectedLifts] = useState<string[]>([])
  const seeded = useRef(false)
  const [logOpen, setLogOpen] = useState(false)

  // Seed the chip selection once lifts exist; drop ids that disappear.
  useEffect(() => {
    if (!seeded.current && rankedLifts.length > 0) {
      seeded.current = true
      setSelectedLifts(defaultLiftSelection(rankedLifts))
    }
  }, [rankedLifts])

  const toggleLift = (id: string) => {
    haptics.light()
    setSelectedLifts((sel) => {
      if (sel.includes(id)) return sel.filter((x) => x !== id)
      if (sel.length >= MAX_OVERLAY_LIFTS) return sel
      return [...sel, id]
    })
  }

  const kind = active ? METRICS[active].kind : null

  // ── series for the active metric ────────────────────────────────────────
  const liftSeries: ChartSeries[] = useMemo(() => {
    if (!active || METRICS[active].kind !== 'lift') return []
    return selectedLifts
      .map((id, i) => ({
        color: SERIES_COLORS[i],
        points: filterRange(
          liftMetricSeries(active as 'est1rm' | 'maxWeight' | 'maxReps' | 'liftVolume', data.logsByLift.get(id) ?? [], units),
          range,
          now,
        ),
      }))
      .filter((s) => s.points.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, selectedLifts, data, units, range])

  const globalPoints: ChartPoint[] = useMemo(() => {
    if (!active || METRICS[active].kind !== 'global') return []
    const pts =
      active === 'dots'
        ? dotsSeries(data.logs, data.lifts, data.bodyWeights, sex)
        : active === 'bodyweight'
          ? bodyweightSeries(data.bodyWeights, units)
          : weeklyVolumeSeries(data.logs, units)
    return filterRange(pts, range, now)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, data, units, sex, range])

  // ── header stat ─────────────────────────────────────────────────────────
  const dotsCaption = useMemo(() => {
    if (active !== 'dots') return null
    const best: Record<'squat' | 'bench' | 'deadlift', number> = { squat: 0, bench: 0, deadlift: 0 }
    for (const lift of data.lifts) {
      const kw = sbdKeyword(lift.name)
      if (!kw) continue
      for (const s of data.logsByLift.get(lift.id) ?? []) {
        if (s.isWarmup || s.reps <= 0 || s.weight <= 0) continue
        best[kw] = Math.max(best[kw], epley1RM(s.weight, s.reps))
      }
    }
    const latestBw = [...data.bodyWeights].sort((a, b) => a.date.localeCompare(b.date)).slice(-1)[0]
    if (!latestBw || best.squat === 0 || best.bench === 0 || best.deadlift === 0) return null
    const total = best.squat + best.bench + best.deadlift
    return {
      score: Math.round(dotsScore(total, latestBw.weightKg, sex) * 10) / 10,
      caption: `est total ${formatWeight(Math.round(total * 10) / 10, units)} @ ${formatWeight(latestBw.weightKg, units)}`,
    }
  }, [active, data, sex, units])

  const latestBw = [...data.bodyWeights].sort((a, b) => a.date.localeCompare(b.date)).slice(-1)[0]
  const latestGlobal = globalPoints[globalPoints.length - 1]

  const emptyMessage =
    kind === 'lift'
      ? rankedLifts.length === 0
        ? 'Lifts show up here once you log sets.'
        : 'No sets in this range for the picked lifts.'
      : active === 'dots'
        ? 'Log squat, bench, deadlift and bodyweight to unlock DOTS.'
        : active === 'bodyweight'
          ? 'No bodyweight entries yet.'
          : 'Volume shows up once you log sets.'

  const fmtVolume = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n))

  return (
    <div>
      <div style={{ margin: '0 2px 12px', fontSize: 12, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
        {title}
      </div>

      {/* metric pill rail (drop target for cross-card drags) */}
      <div
        ref={(el) => registerRail(cardIndex, el)}
        data-graph-rail={cardIndex}
        className="no-scrollbar"
        style={{
          display: 'flex',
          gap: 4,
          padding: 3,
          borderRadius: 12,
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          overflowX: 'auto',
          minHeight: 36,
          boxSizing: 'border-box',
        }}
      >
        {metricIds.length === 0 ? (
          <span style={{ flex: 1, textAlign: 'center', alignSelf: 'center', fontSize: 12, fontWeight: 600, color: 'var(--text-faint)', padding: '6px 0' }}>
            Drop a metric here
          </span>
        ) : (
          metricIds.map((m) => (
            <MetricPill
              key={m}
              metric={m}
              active={m === active}
              dimmed={draggingId === m}
              onTap={() => {
                if (m !== active) {
                  haptics.light()
                  onSelect(m)
                }
              }}
              onLongPress={(rect, point) => onPillLongPress(m, cardIndex, rect, point)}
            />
          ))
        )}
      </div>

      {/* range row — its own line so the header stat never gets squeezed */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 2, margin: '10px 2px 2px' }}>
        {RANGES.map((r) => (
          <button
            key={r.id}
            onClick={() => {
              if (r.id === range) return
              haptics.light()
              setRange(r.id)
            }}
            aria-pressed={range === r.id}
            style={{
              padding: '4px 9px',
              borderRadius: 999,
              border: range === r.id ? '1px solid var(--border-strong)' : '1px solid transparent',
              background: range === r.id ? 'var(--surface-2)' : 'none',
              fontSize: 11,
              fontWeight: 700,
              color: range === r.id ? 'var(--text)' : 'var(--text-faint)',
              cursor: 'pointer',
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* header stat row */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, margin: '0 2px 10px', minHeight: 40 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          {active === 'dots' && dotsCaption ? (
            <>
              <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--accent)', lineHeight: 1 }}>
                <RollingNumber value={dotsCaption.score} decimals={1} />
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {dotsCaption.caption}
              </span>
            </>
          ) : active === 'bodyweight' ? (
            <>
              <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)', lineHeight: 1.1, whiteSpace: 'nowrap' }}>
                {latestBw ? formatWeight(latestBw.weightKg, units) : '—'}
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)' }}>
                {latestBw
                  ? `logged ${new Date(`${latestBw.date}T00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
                  : 'no entries yet'}
              </span>
            </>
          ) : active === 'weeklyVolume' && latestGlobal ? (
            <>
              <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)', lineHeight: 1.1, whiteSpace: 'nowrap' }}>
                {fmtVolume(latestGlobal.y)} {units}
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)' }}>{latestGlobal.label}</span>
            </>
          ) : (
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)' }}>
              {kind === 'lift' ? 'tap chips to overlay lifts' : ''}
            </span>
          )}
        </div>

        {active === 'bodyweight' && (
          <Button variant="ghost" onClick={() => setLogOpen(true)} style={{ minHeight: 34, padding: '0 12px', fontSize: 13, flexShrink: 0 }}>
            Log weight
          </Button>
        )}
      </div>

      {/* chart */}
      {kind === 'lift' ? (
        liftSeries.length > 0 ? (
          <LineChart series={liftSeries} height={170} formatY={active === 'liftVolume' ? fmtVolume : undefined} />
        ) : (
          <div style={{ padding: '28px 8px', fontSize: 14, fontWeight: 600, color: 'var(--text-dim)' }}>{emptyMessage}</div>
        )
      ) : globalPoints.length > 0 ? (
        <LineChart points={globalPoints} height={170} formatY={active === 'weeklyVolume' ? fmtVolume : undefined} />
      ) : (
        <div style={{ padding: '28px 8px', fontSize: 14, fontWeight: 600, color: 'var(--text-dim)' }}>{emptyMessage}</div>
      )}

      {/* lift overlay chips */}
      {kind === 'lift' && rankedLifts.length > 0 && (
        <div className="no-scrollbar" style={{ display: 'flex', gap: 6, marginTop: 12, overflowX: 'auto', paddingBottom: 2 }}>
          {rankedLifts.map((lift) => {
            const idx = selectedLifts.indexOf(lift.id)
            const on = idx !== -1
            const color = on ? SERIES_COLORS[idx] : null
            return (
              <button
                key={lift.id}
                onClick={() => toggleLift(lift.id)}
                aria-pressed={on}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  flexShrink: 0,
                  padding: '6px 11px',
                  borderRadius: 999,
                  background: 'var(--surface-2)',
                  border: `1px solid ${color ?? 'var(--border-strong)'}`,
                  fontSize: 12,
                  fontWeight: 700,
                  color: on ? 'var(--text)' : 'var(--text-dim)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {color && (
                  <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                )}
                {lift.name}
              </button>
            )
          })}
        </div>
      )}

      <LogWeightSheet open={logOpen} onClose={() => setLogOpen(false)} units={units} seedKg={latestBw?.weightKg ?? null} />
    </div>
  )
}
