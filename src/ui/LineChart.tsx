import { useId, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { niceScale } from './chartScale'
import { haptics } from './haptics'

export interface ChartPoint {
  x: number
  y: number
  /** Tooltip caption, e.g. a formatted date. */
  label?: string
}

export interface ChartSeries {
  points: ChartPoint[]
  /** CSS color (token var) for this series' line + points. */
  color: string
}

interface LineChartProps {
  /** Single-series shorthand (accent color, area fill, glow). */
  points?: ChartPoint[]
  /** Multi-series mode: shared scale, one colored line each, no area fill. */
  series?: ChartSeries[]
  height?: number
  formatY?: (n: number) => string
}

const W = 360
const PAD_L = 42
const PAD_R = 14
const PAD_T = 14
const PAD_B = 22

/** Catmull-Rom → cubic bezier smoothed path through the given pixel points. */
function smoothPath(pts: { px: number; py: number }[]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M ${pts[0].px} ${pts[0].py}`
  let d = `M ${pts[0].px} ${pts[0].py}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const c1x = p1.px + (p2.px - p0.px) / 6
    const c1y = p1.py + (p2.py - p0.py) / 6
    const c2x = p2.px - (p3.px - p1.px) / 6
    const c2y = p2.py - (p3.py - p1.py) / 6
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.px.toFixed(2)} ${p2.py.toFixed(2)}`
  }
  return d
}

/**
 * Animated SVG line chart: smoothed path(s) draw themselves in on scroll,
 * tappable data points, nice-number y grid. Single-series mode keeps the
 * accent gradient area fill + glow; multi-series mode shares one scale and
 * draws each series in its own color.
 */
export function LineChart({ points, series, height = 180, formatY }: LineChartProps) {
  const gradId = useId()
  const [selected, setSelected] = useState<{ s: number; i: number } | null>(null)
  const H = height
  const fmt = formatY ?? ((n: number) => String(n))

  const multi = series !== undefined
  const all: ChartSeries[] = useMemo(
    () => (series ?? [{ points: points ?? [], color: 'var(--accent)' }]).filter((s) => s.points.length > 0),
    [series, points],
  )

  const { pxSeries, scale } = useMemo(() => {
    const ys = all.flatMap((s) => s.points.map((p) => p.y))
    const xs = all.flatMap((s) => s.points.map((p) => p.x))
    const scale = niceScale(ys.length ? Math.min(...ys) : 0, ys.length ? Math.max(...ys) : 1, 5)
    const xLo = xs.length ? Math.min(...xs) : 0
    const xHi = xs.length ? Math.max(...xs) : 1
    const xSpan = xHi - xLo || 1
    const ySpan = scale.hi - scale.lo || 1
    const single = xs.length === 1
    const pxSeries = all.map((s) =>
      s.points.map((p) => ({
        px: single ? (PAD_L + W - PAD_R) / 2 : PAD_L + ((p.x - xLo) / xSpan) * (W - PAD_L - PAD_R),
        py: PAD_T + (1 - (p.y - scale.lo) / ySpan) * (H - PAD_T - PAD_B),
      })),
    )
    return { pxSeries, scale }
  }, [all, H])

  if (all.length === 0) return null

  const sel =
    selected !== null &&
    selected.s < all.length &&
    selected.i < all[selected.s].points.length
      ? selected
      : null
  const selPx = sel !== null ? pxSeries[sel.s][sel.i] : null
  const selPoint = sel !== null ? all[sel.s].points[sel.i] : null
  const tooltipX = selPx !== null ? Math.min(Math.max(selPx.px, PAD_L + 34), W - PAD_R - 34) : 0

  const totalPoints = all.reduce((n, s) => n + s.points.length, 0)

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
      role="img"
      aria-label={`Line chart with ${totalPoints} data points${multi ? ` across ${all.length} series` : ''}`}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* y grid */}
      {scale.ticks.map((t) => {
        const y = PAD_T + (1 - (t - scale.lo) / (scale.hi - scale.lo || 1)) * (H - PAD_T - PAD_B)
        return (
          <g key={t}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" />
            <text
              x={PAD_L - 8}
              y={y + 3.5}
              textAnchor="end"
              fontSize="10"
              fontWeight="600"
              fill="var(--text-faint)"
            >
              {fmt(t)}
            </text>
          </g>
        )
      })}

      {/* area fill (single-series only) — fades in after the line draws */}
      {!multi && pxSeries[0].length > 1 && (
        <motion.path
          d={`${smoothPath(pxSeries[0])} L ${pxSeries[0][pxSeries[0].length - 1].px} ${H - PAD_B} L ${pxSeries[0][0].px} ${H - PAD_B} Z`}
          fill={`url(#${gradId})`}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ delay: 0.55, duration: 0.45, ease: 'easeOut' }}
        />
      )}

      {/* each line draws itself in */}
      {all.map((s, si) =>
        pxSeries[si].length > 1 ? (
          <motion.path
            key={`line-${si}`}
            d={smoothPath(pxSeries[si])}
            fill="none"
            stroke={s.color}
            strokeWidth="2.5"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.9, ease: 'easeOut', delay: multi ? si * 0.12 : 0 }}
          />
        ) : null,
      )}

      {/* data points spring in, staggered */}
      {all.map((s, si) =>
        pxSeries[si].map((p, i) => (
          <motion.circle
            key={`pt-${si}-${i}`}
            cx={p.px}
            cy={p.py}
            r={sel !== null && sel.s === si && sel.i === i ? 6 : multi ? 3.2 : 4}
            fill={s.color}
            stroke="var(--bg)"
            strokeWidth="2"
            style={{ filter: multi ? undefined : `drop-shadow(0 0 6px ${s.color})`, cursor: 'pointer' }}
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ delay: 0.25 + Math.min(i * 0.06, 0.8), type: 'spring', stiffness: 380, damping: 22 }}
            onClick={() => {
              haptics.light()
              setSelected(sel !== null && sel.s === si && sel.i === i ? null : { s: si, i })
            }}
          />
        )),
      )}

      {/* tooltip pill */}
      <AnimatePresence>
        {sel !== null && selPx !== null && selPoint !== null && (
          <motion.g
            key={`${sel.s}-${sel.i}`}
            initial={{ opacity: 0, y: 6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            style={{ pointerEvents: 'none' }}
          >
            <rect
              x={tooltipX - 38}
              y={Math.max(2, selPx.py - 44)}
              width="76"
              height="32"
              rx="9"
              fill="var(--surface-2)"
              stroke="var(--border-strong)"
            />
            <text
              x={tooltipX}
              y={Math.max(2, selPx.py - 44) + 13.5}
              textAnchor="middle"
              fontSize="11"
              fontWeight="700"
              fill={multi ? all[sel.s].color : 'var(--text)'}
            >
              {fmt(selPoint.y)}
            </text>
            <text
              x={tooltipX}
              y={Math.max(2, selPx.py - 44) + 25.5}
              textAnchor="middle"
              fontSize="9"
              fontWeight="600"
              fill="var(--text-dim)"
            >
              {selPoint.label ?? ''}
            </text>
          </motion.g>
        )}
      </AnimatePresence>
    </svg>
  )
}
