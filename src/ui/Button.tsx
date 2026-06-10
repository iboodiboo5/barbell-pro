import type { CSSProperties, ReactNode } from 'react'
import { PressScale } from './PressScale'

type ButtonVariant = 'primary' | 'ghost' | 'danger'

interface ButtonProps {
  children: ReactNode
  onClick?: () => void
  variant?: ButtonVariant
  fullWidth?: boolean
  disabled?: boolean
  className?: string
  style?: CSSProperties
  'aria-label'?: string
}

const variantStyles: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: 'var(--accent)',
    color: 'var(--text)',
    border: '1px solid transparent',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--accent)',
    border: '1px solid var(--border-strong)',
  },
  danger: {
    background: 'var(--danger)',
    color: 'var(--text)',
    border: '1px solid transparent',
  },
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  fullWidth,
  disabled,
  className,
  style,
  'aria-label': ariaLabel,
}: ButtonProps) {
  return (
    <PressScale
      onClick={onClick}
      disabled={disabled}
      className={className}
      aria-label={ariaLabel}
      style={{
        display: fullWidth ? 'flex' : 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        minHeight: 44,
        padding: '0 20px',
        borderRadius: 14,
        fontSize: 16,
        fontWeight: 600,
        lineHeight: 1.2,
        width: fullWidth ? '100%' : undefined,
        ...variantStyles[variant],
        ...style,
      }}
    >
      {children}
    </PressScale>
  )
}
