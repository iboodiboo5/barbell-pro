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

interface LineChartProps {
  points: ChartPoint[]
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
 * Animated SVG line chart: smoothed accent path draws itself in on scroll,
 * gradient area fill, glowing tappable data points, nice-number y grid.
 */
export function LineChart({ points, height = 180, formatY }: LineChartProps) {
  const gradId = useId()
  const [selected, setSelected] = useState<number | null>(null)
  const H = height
  const fmt = formatY ?? ((n: number) => String(n))

  const { px, scale } = useMemo(() => {
    const ys = points.map((p) => p.y)
    const scale = niceScale(Math.min(...ys, Infinity) === Infinity ? 0 : Math.min(...ys), points.length ? Math.max(...ys) : 1, 5)
    const xs = points.map((p) => p.x)
    const xLo = Math.min(...xs)
    const xHi = Math.max(...xs)
    const xSpan = xHi - xLo || 1
    const ySpan = scale.hi - scale.lo || 1
    const px = points.map((p) => ({
      px: points.length === 1 ? (PAD_L + W - PAD_R) / 2 : PAD_L + ((p.x - xLo) / xSpan) * (W - PAD_L - PAD_R),
      py: PAD_T + (1 - (p.y - scale.lo) / ySpan) * (H - PAD_T - PAD_B),
    }))
    return { px, scale }
  }, [points, H])

  if (points.length === 0) return null

  const linePath = smoothPath(px)
  const areaPath = `${linePath} L ${px[px.length - 1].px} ${H - PAD_B} L ${px[0].px} ${H - PAD_B} Z`
  const sel = selected !== null && selected < points.length ? selected : null
  const tooltipX = sel !== null ? Math.min(Math.max(px[sel].px, PAD_L + 34), W - PAD_R - 34) : 0

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
      role="img"
      aria-label={`Line chart with ${points.length} data points`}
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

      {/* area fill — fades in after the line draws */}
      {points.length > 1 && (
        <motion.path
          d={areaPath}
          fill={`url(#${gradId})`}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ delay: 0.55, duration: 0.45, ease: 'easeOut' }}
        />
      )}

      {/* the line draws itself in */}
      {points.length > 1 && (
        <motion.path
          d={linePath}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
      )}

      {/* data points spring in, staggered */}
      {px.map((p, i) => (
        <motion.circle
          key={i}
          cx={p.px}
          cy={p.py}
          r={sel === i ? 6 : 4}
          fill="var(--accent)"
          stroke="var(--bg)"
          strokeWidth="2"
          style={{ filter: 'drop-shadow(0 0 6px var(--accent))', cursor: 'pointer' }}
          initial={{ scale: 0 }}
          whileInView={{ scale: 1 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ delay: 0.25 + Math.min(i * 0.06, 0.8), type: 'spring', stiffness: 380, damping: 22 }}
          onClick={() => {
            haptics.light()
            setSelected(sel === i ? null : i)
          }}
        />
      ))}

      {/* tooltip pill */}
      <AnimatePresence>
        {sel !== null && (
          <motion.g
            key={sel}
            initial={{ opacity: 0, y: 6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            style={{ pointerEvents: 'none' }}
          >
            <rect
              x={tooltipX - 38}
              y={Math.max(2, px[sel].py - 44)}
              width="76"
              height="32"
              rx="9"
              fill="var(--surface-2)"
              stroke="var(--border-strong)"
            />
            <text
              x={tooltipX}
              y={Math.max(2, px[sel].py - 44) + 13.5}
              textAnchor="middle"
              fontSize="11"
              fontWeight="700"
              fill="var(--text)"
            >
              {fmt(points[sel].y)}
            </text>
            <text
              x={tooltipX}
              y={Math.max(2, px[sel].py - 44) + 25.5}
              textAnchor="middle"
              fontSize="9"
              fontWeight="600"
              fill="var(--text-dim)"
            >
              {points[sel].label ?? ''}
            </text>
          </motion.g>
        )}
      </AnimatePresence>
    </svg>
  )
}
