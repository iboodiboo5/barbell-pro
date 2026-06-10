import type { CSSProperties, ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  glow?: boolean
  className?: string
  style?: CSSProperties
}

export function Card({ children, glow, className, style }: CardProps) {
  return (
    <div
      className={className}
      style={{
        background: 'var(--surface)',
        border: `1px solid ${glow ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-card)',
        padding: 16,
        boxShadow: glow ? '0 0 24px var(--accent-soft), 0 0 48px var(--accent-soft)' : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
