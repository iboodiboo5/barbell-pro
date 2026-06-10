import { motion } from 'motion/react'
import { useEffect, useMemo } from 'react'

interface ConfettiProps {
  onDone?: () => void
}

const COLORS = ['var(--accent)', 'var(--gold)', 'var(--success)', 'var(--text)']
const PARTICLE_COUNT = 40
const DURATION = 1.2
const TOTAL_MS = 1400

interface Particle {
  id: number
  color: string
  size: number
  circle: boolean
  // keyframes
  x: [number, number, number]
  y: [number, number, number]
  rotate: number
  delay: number
}

function makeParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, id) => {
    const angle = Math.random() * Math.PI * 2
    const speed = 90 + Math.random() * 180
    const vx = Math.cos(angle) * speed
    const vy = Math.sin(angle) * speed - 60 // bias the burst slightly upward
    const gravity = 220 + Math.random() * 120
    return {
      id,
      color: COLORS[id % COLORS.length],
      size: 4 + Math.random() * 4,
      circle: Math.random() < 0.4,
      x: [0, vx * 0.7, vx],
      y: [0, vy * 0.7, vy + gravity],
      rotate: (Math.random() - 0.5) * 720,
      delay: Math.random() * 0.08,
    }
  })
}

/** Full-overlay celebration burst (~1.2s). Parent should unmount on onDone. */
export function Confetti({ onDone }: ConfettiProps) {
  const particles = useMemo(makeParticles, [])

  useEffect(() => {
    if (!onDone) return
    const t = setTimeout(onDone, TOTAL_MS)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 300,
      }}
    >
      {particles.map((p) => (
        <motion.span
          key={p.id}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: 1 }}
          animate={{
            x: p.x,
            y: p.y,
            rotate: p.rotate,
            opacity: [1, 1, 0],
            scale: [1, 1, 0.7],
          }}
          transition={{
            duration: DURATION,
            delay: p.delay,
            times: [0, 0.4, 1],
            ease: ['easeOut', 'easeIn'],
          }}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: p.size,
            height: p.circle ? p.size : p.size * 1.6,
            marginLeft: -p.size / 2,
            marginTop: -p.size / 2,
            borderRadius: p.circle ? '50%' : 2,
            background: p.color,
          }}
        />
      ))}
    </div>
  )
}
