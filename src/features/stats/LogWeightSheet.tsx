import { useEffect, useState } from 'react'
import { repo } from '../../data/repo'
import { kgToLbs } from '../../lib/plateMath'
import { Button } from '../../ui/Button'
import { Sheet } from '../../ui/Sheet'
import { PressScale } from '../../ui/PressScale'
import { RollingNumber } from '../../ui/RollingNumber'
import { haptics } from '../../ui/haptics'
import { sound } from '../../ui/sound'
import { toast } from '../../ui/Toast'

function todayIso(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const STEP_KG = 0.5

/** Bodyweight logging sheet (was embedded in BodyWeightCard). */
export function LogWeightSheet({
  open,
  onClose,
  units,
  seedKg,
}: {
  open: boolean
  onClose: () => void
  units: 'kg' | 'lbs'
  /** Latest known bodyweight to seed the stepper with. */
  seedKg: number | null
}) {
  const [draftKg, setDraftKg] = useState<number>(80)
  const [date, setDate] = useState(todayIso())

  useEffect(() => {
    if (!open) return
    setDraftKg(seedKg ?? 80)
    setDate(todayIso())
  }, [open, seedKg])

  const save = async () => {
    await repo.addBodyWeight(draftKg, date)
    haptics.success()
    sound.complete()
    onClose()
    toast('Bodyweight logged')
  }

  const draftDisplay = Math.round((units === 'kg' ? draftKg : kgToLbs(draftKg)) * 10) / 10

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Log bodyweight"
      footer={
        <Button fullWidth onClick={() => void save()}>
          Save
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '8px 0 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <PressScale
            onClick={() => { haptics.medium(); sound.tick(); setDraftKg((v) => Math.max(20, Math.round((v - STEP_KG) * 10) / 10)) }}
            aria-label="Decrease bodyweight"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: '50%', background: 'var(--surface-2)', border: '1px solid var(--border-strong)', color: 'var(--accent)' }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
          </PressScale>
          <div style={{ textAlign: 'center', minWidth: 130 }}>
            <span style={{ fontSize: 44, fontWeight: 800, color: 'var(--text)' }}>
              <RollingNumber value={draftDisplay} decimals={1} />
            </span>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
              {units}
            </div>
          </div>
          <PressScale
            onClick={() => { haptics.medium(); sound.tick(); setDraftKg((v) => Math.round((v + STEP_KG) * 10) / 10) }}
            aria-label="Increase bodyweight"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: '50%', background: 'var(--surface-2)', border: '1px solid var(--border-strong)', color: 'var(--accent)' }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          </PressScale>
        </div>

        <input
          type="date"
          value={date}
          max={todayIso()}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          aria-label="Entry date"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border-strong)',
            borderRadius: 10,
            color: 'var(--text)',
            colorScheme: 'dark',
            padding: '8px 12px',
            fontSize: 14,
            fontWeight: 600,
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
      </div>
    </Sheet>
  )
}
