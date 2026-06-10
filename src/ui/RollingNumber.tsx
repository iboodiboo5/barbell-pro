import { motion } from 'motion/react'
import type { CSSProperties } from 'react'

interface RollingNumberProps {
  value: number
  decimals?: number
  /** Left-pad the formatted value with zeros to this many characters (e.g. 2 → "05"). */
  pad?: number
  style?: CSSProperties
}

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

/** One 0-9 column that springs vertically to the active digit. Sized in em so
 *  it stays correct at any font size. */
function DigitColumn({ digit }: { digit: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        height: '1em',
        overflow: 'hidden',
        verticalAlign: 'baseline',
      }}
    >
      <motion.span
        style={{ display: 'block' }}
        initial={false}
        animate={{ y: `${-digit}em` }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        {DIGITS.map((d) => (
          <span
            key={d}
            style={{ display: 'block', height: '1em', lineHeight: '1em', textAlign: 'center' }}
          >
            {d}
          </span>
        ))}
      </motion.span>
    </span>
  )
}

/** Odometer-style rolling number. Non-digit chars (".", ":", "-") render static. */
export function RollingNumber({ value, decimals = 0, pad = 0, style }: RollingNumberProps) {
  const text = value.toFixed(decimals).padStart(pad, '0')
  const chars = text.split('')

  return (
    <span
      aria-label={text}
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        fontVariantNumeric: 'tabular-nums',
        lineHeight: '1em',
        ...style,
      }}
    >
      {chars.map((ch, i) => {
        // Key digits by distance from the right end so the ones/tens/…
        // columns keep identity when the digit count changes.
        const key = `c${chars.length - i}`
        return /\d/.test(ch) ? (
          <DigitColumn key={key} digit={Number(ch)} />
        ) : (
          <span key={key} aria-hidden="true" style={{ display: 'inline-block', lineHeight: '1em' }}>
            {ch}
          </span>
        )
      })}
    </span>
  )
}
