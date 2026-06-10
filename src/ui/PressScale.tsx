import { motion } from 'motion/react'
import type { CSSProperties, ReactNode } from 'react'
import { haptics } from './haptics'

interface PressScaleProps {
  children: ReactNode
  onClick?: () => void
  className?: string
  style?: CSSProperties
  disabled?: boolean
  /** Override focusability (e.g. -1 while the control is visually hidden). */
  tabIndex?: number
  'aria-label'?: string
}

/** Springy press-down wrapper: scales to .96 while tapped, light haptic on touch. */
export function PressScale({
  children,
  onClick,
  className,
  style,
  disabled,
  tabIndex,
  'aria-label': ariaLabel,
}: PressScaleProps) {
  return (
    <motion.div
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 600, damping: 30 }}
      onPointerDown={() => {
        if (!disabled) haptics.light()
      }}
      onClick={disabled ? undefined : onClick}
      className={className}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick && !disabled ? (tabIndex ?? 0) : undefined}
      onKeyDown={
        onClick && !disabled
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      style={{
        cursor: onClick && !disabled ? 'pointer' : undefined,
        ...style,
        ...(disabled ? { opacity: 0.4, pointerEvents: 'none' as const } : null),
      }}
    >
      {children}
    </motion.div>
  )
}
