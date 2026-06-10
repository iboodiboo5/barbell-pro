import { useId } from 'react'
import { motion } from 'motion/react'

interface BarGraphicProps {
  /** Plates loaded on each side, kg, sorted heaviest-first (from computePlates). */
  perSide: number[]
  barWeightKg: number
}

/** IPF color-coding token for a plate denomination (kg). */
export function plateColor(denom: number): string {
  if (denom === 25) return 'var(--plate-25)'
  if (denom === 20) return 'var(--plate-20)'
  if (denom === 15) return 'var(--plate-15)'
  if (denom === 10) return 'var(--plate-10)'
  if (denom === 5) return 'var(--plate-5)'
  if (denom === 2.5) return 'var(--plate-2-5)'
  if (denom === 1.25) return 'var(--plate-1-25)'
  return 'var(--text-faint)'
}

// ── geometry (viewBox units) ────────────────────────────────────────────────
const VB_W = 358
const VB_H = 150
const CY = 75 // bar centerline

const SLEEVE_LEN = 104 // sleeve tip (bar end) → collar, each side
const COLLAR_W = 9
const COLLAR_H = 36
const SLEEVE_H = 15
const SHAFT_H = 7
const PLATE_GAP = 2

/** [denom, height, width] — diameter/thickness scaled per denomination. */
const PLATE_SIZES: Array<[number, number, number]> = [
  [25, 128, 15],
  [20, 114, 13],
  [15, 98, 12],
  [10, 80, 11],
  [5, 62, 9],
  [2.5, 46, 8],
  [1.25, 34, 7],
]

function plateDims(denom: number): { h: number; w: number } {
  for (const [d, h, w] of PLATE_SIZES) if (d === denom) return { h, w }
  // Unknown denomination: interpolate between the smallest and largest discs.
  const t = Math.min(1, Math.max(0, (denom - 1.25) / (25 - 1.25)))
  return { h: 34 + t * 94, w: 7 + t * 8 }
}

const plateSpring = { type: 'spring', stiffness: 360, damping: 26 } as const

/**
 * Side-view SVG barbell: shaft + collars + sleeves, with the computed plates
 * mirrored on both sleeves. Each plate springs in from its bar end, staggered
 * innermost-first; keys of `side-index-denom` mean stepping the target only
 * re-animates the plates that actually changed.
 */
export function BarGraphic({ perSide, barWeightKg }: BarGraphicProps) {
  const uid = useId()
  const shaftGrad = `${uid}-shaft`
  const sleeveGrad = `${uid}-sleeve`

  // Lay plates along the sleeve from the collar outward; squeeze widths if a
  // monster load would overflow the sleeve.
  const dims = perSide.map(plateDims)
  const natural =
    dims.reduce((s, d) => s + d.w, 0) + PLATE_GAP * Math.max(0, perSide.length - 1)
  const usable = SLEEVE_LEN - 12 // keep a stub of bare sleeve at the tip
  const squeeze = natural > usable ? usable / natural : 1

  let cursor = 0
  const slots = perSide.map((denom, i) => {
    const w = dims[i].w * squeeze
    const offset = cursor
    cursor += w + PLATE_GAP * squeeze
    return { denom, w, h: dims[i].h, offset, i }
  })

  const shaftX1 = SLEEVE_LEN + COLLAR_W
  const shaftX2 = VB_W - SLEEVE_LEN - COLLAR_W

  const label =
    perSide.length === 0
      ? `Empty ${barWeightKg} kg bar`
      : `${barWeightKg} kg bar loaded with ${perSide.join(', ')} kg per side`

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width="100%"
      role="img"
      aria-label={label}
      style={{ display: 'block' }}
    >
      <defs>
        {/* subtle vertical metal sheen: dark top edge, highlight, falloff */}
        <linearGradient id={shaftGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--text-faint)" />
          <stop offset="0.3" stopColor="var(--text-dim)" />
          <stop offset="0.62" stopColor="var(--text-faint)" />
          <stop offset="1" stopColor="var(--border-strong)" />
        </linearGradient>
        <linearGradient id={sleeveGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--text-dim)" />
          <stop offset="0.28" stopColor="var(--text)" stopOpacity="0.72" />
          <stop offset="0.6" stopColor="var(--text-dim)" />
          <stop offset="1" stopColor="var(--border-strong)" />
        </linearGradient>
      </defs>

      {/* sleeves (bar ends the plates slide onto) */}
      <rect x={0} y={CY - SLEEVE_H / 2} width={SLEEVE_LEN} height={SLEEVE_H} rx={4} fill={`url(#${sleeveGrad})`} />
      <rect x={VB_W - SLEEVE_LEN} y={CY - SLEEVE_H / 2} width={SLEEVE_LEN} height={SLEEVE_H} rx={4} fill={`url(#${sleeveGrad})`} />

      {/* shaft + knurl bands */}
      <rect x={shaftX1} y={CY - SHAFT_H / 2} width={shaftX2 - shaftX1} height={SHAFT_H} rx={2} fill={`url(#${shaftGrad})`} />
      <rect x={shaftX1 + 20} y={CY - SHAFT_H / 2} width={13} height={SHAFT_H} fill="var(--bg)" opacity={0.28} />
      <rect x={shaftX2 - 33} y={CY - SHAFT_H / 2} width={13} height={SHAFT_H} fill="var(--bg)" opacity={0.28} />

      {/* collars (plates seat against these) */}
      <rect x={SLEEVE_LEN} y={CY - COLLAR_H / 2} width={COLLAR_W} height={COLLAR_H} rx={3} fill={`url(#${sleeveGrad})`} />
      <rect x={shaftX2} y={CY - COLLAR_H / 2} width={COLLAR_W} height={COLLAR_H} rx={3} fill={`url(#${sleeveGrad})`} />

      {/* bar weight, centered on the plate-free shaft */}
      <text
        x={VB_W / 2}
        y={CY + SHAFT_H / 2 + 18}
        textAnchor="middle"
        fill="var(--text-faint)"
        style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em' }}
      >
        {barWeightKg} kg bar
      </text>

      {/* plates — mirrored, innermost seated against the collar */}
      {slots.map(({ denom, w, h, offset, i }) => {
        const fill = plateColor(denom)
        const rx = Math.min(4, w / 2.4)
        const y = CY - h / 2
        const leftX = SLEEVE_LEN - offset - w
        const rightX = shaftX2 + COLLAR_W + offset
        const delay = i * 0.055
        return (
          <g key={`${i}-${denom}`}>
            <motion.g
              key={`L-${i}-${denom}`}
              initial={{ x: -(leftX + w + 8), opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ ...plateSpring, delay }}
            >
              <rect x={leftX} y={y} width={w} height={h} rx={rx} fill={fill} stroke="var(--text-faint)" strokeOpacity={0.45} strokeWidth={0.75} />
              <rect x={leftX + 2} y={y + 4} width={1.6} height={h - 8} rx={0.8} fill="var(--text)" opacity={0.22} />
            </motion.g>
            <motion.g
              key={`R-${i}-${denom}`}
              initial={{ x: VB_W - rightX + 8, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ ...plateSpring, delay }}
            >
              <rect x={rightX} y={y} width={w} height={h} rx={rx} fill={fill} stroke="var(--text-faint)" strokeOpacity={0.45} strokeWidth={0.75} />
              <rect x={rightX + 2} y={y + 4} width={1.6} height={h - 8} rx={0.8} fill="var(--text)" opacity={0.22} />
            </motion.g>
          </g>
        )
      })}
    </svg>
  )
}
