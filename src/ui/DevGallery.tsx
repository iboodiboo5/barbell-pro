// THROWAWAY dev kitchen-sink — removed in Task 15.
import { useEffect, useState } from 'react'
import { Button } from './Button'
import { Card } from './Card'
import { Confetti } from './Confetti'
import { PressScale } from './PressScale'
import { ProgressRing } from './ProgressRing'
import { RollingNumber } from './RollingNumber'
import { Sheet } from './Sheet'
import { haptics } from './haptics'
import { sound } from './sound'

function SectionLabel({ children }: { children: string }) {
  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--text-dim)',
        margin: '28px 0 12px',
      }}
    >
      {children}
    </div>
  )
}

export function DevGallery() {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [num, setNum] = useState(132.5)
  const [progress, setProgress] = useState(0.2)
  const [confetti, setConfetti] = useState(false)

  // ProgressRing animating on a timer
  useEffect(() => {
    const t = setInterval(() => {
      setProgress((p) => (p >= 1 ? 0 : Math.min(1, p + 0.25)))
    }, 1600)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{ padding: '16px 20px', maxWidth: 480, margin: '0 auto', position: 'relative' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', margin: '8px 0 0' }}>
        Design System
      </h1>
      <p style={{ color: 'var(--text-dim)', fontSize: 14, margin: '4px 0 0' }}>
        Dev gallery — removed before ship.
      </p>

      <SectionLabel>Buttons</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button fullWidth onClick={() => sound.tick()}>
          Primary
        </Button>
        <Button fullWidth variant="ghost" onClick={() => sound.tick()}>
          Ghost
        </Button>
        <Button fullWidth variant="danger" onClick={() => haptics.warning()}>
          Danger
        </Button>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button onClick={() => sound.complete()}>Inline</Button>
          <Button variant="ghost" disabled>
            Disabled
          </Button>
        </div>
      </div>

      <SectionLabel>Cards</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Card>
          <div style={{ fontWeight: 600 }}>Plain card</div>
          <div style={{ color: 'var(--text-dim)', fontSize: 14, marginTop: 4 }}>
            Surface, border, 20px radius.
          </div>
        </Card>
        <Card glow>
          <div style={{ fontWeight: 600 }}>Glow card</div>
          <div style={{ color: 'var(--text-dim)', fontSize: 14, marginTop: 4 }}>
            Accent halo for highlighted state.
          </div>
        </Card>
      </div>

      <SectionLabel>Rolling number</SectionLabel>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <RollingNumber
            value={num}
            decimals={1}
            style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.02em' }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <PressScale
              onClick={() => {
                setNum((n) => Math.max(0, n - 2.5))
                haptics.medium()
                sound.tick()
              }}
              aria-label="Decrease"
              style={stepperStyle}
            >
              −
            </PressScale>
            <PressScale
              onClick={() => {
                setNum((n) => n + 2.5)
                haptics.medium()
                sound.tick()
              }}
              aria-label="Increase"
              style={stepperStyle}
            >
              +
            </PressScale>
          </div>
        </div>
      </Card>

      <SectionLabel>Progress ring</SectionLabel>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <ProgressRing progress={progress}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{Math.round(progress * 100)}%</span>
          </ProgressRing>
          <span style={{ color: 'var(--text-dim)', fontSize: 14 }}>
            Cycles on a timer — springs between values.
          </span>
        </div>
      </Card>

      <SectionLabel>Sheet & celebration</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 24 }}>
        <Button fullWidth variant="ghost" onClick={() => setSheetOpen(true)}>
          Open sheet
        </Button>
        <Button
          fullWidth
          onClick={() => {
            setConfetti(true)
            sound.pr()
            haptics.success()
          }}
          style={{ background: 'var(--gold)', color: 'var(--bg)' }}
        >
          PR!
        </Button>
      </div>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Sample sheet">
        <p style={{ color: 'var(--text-dim)', fontSize: 15, marginTop: 0 }}>
          Drag down past 120px to dismiss, or tap the backdrop. Content scrolls when it
          overflows.
        </p>
        {Array.from({ length: 12 }, (_, i) => (
          <Card key={i} style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 600 }}>Row {i + 1}</div>
            <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>Scrollable content</div>
          </Card>
        ))}
        <Button fullWidth onClick={() => setSheetOpen(false)}>
          Done
        </Button>
      </Sheet>

      {confetti && (
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 300 }}>
          <Confetti onDone={() => setConfetti(false)} />
        </div>
      )}
    </div>
  )
}

const stepperStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 14,
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  fontSize: 22,
  fontWeight: 600,
  color: 'var(--accent)',
}
