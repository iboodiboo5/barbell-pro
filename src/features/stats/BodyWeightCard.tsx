import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import { repo } from '../../data/repo'
import { formatWeight, kgToLbs } from '../../lib/plateMath'
import { Button } from '../../ui/Button'
import { Sheet } from '../../ui/Sheet'
import { PressScale } from '../../ui/PressScale'
import { RollingNumber } from '../../ui/RollingNumber'
import { LineChart } from '../../ui/LineChart'
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

export function BodyWeightCard({ units }: { units: 'kg' | 'lbs' }) {
  const entries = useLiveQuery(
    async () => (await db.bodyWeights.toArray()).sort((a, b) => a.date.localeCompare(b.date)),
    [],
  )
  const latest = entries?.[entries.length - 1]

  const [sheetOpen, setSheetOpen] = useState(false)
  const [draftKg, setDraftKg] = useState<number | null>(null)
  const [date, setDate] = useState(todayIso())

  const openSheet = () => {
    setDraftKg(latest?.weightKg ?? 80)
    setDate(todayIso())
    setSheetOpen(true)
  }

  const save = async () => {
    if (draftKg === null) return
    await repo.addBodyWeight(draftKg, date)
    haptics.success()
    sound.complete()
    setSheetOpen(false)
    toast('Bodyweight logged')
  }

  const points = (entries ?? []).map((e) => ({
    x: new Date(e.date).getTime(),
    y: Math.round((units === 'kg' ? e.weightKg : kgToLbs(e.weightKg)) * 10) / 10,
    label: new Date(e.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
  }))

  const draftDisplay = draftKg !== null
    ? Math.round((units === 'kg' ? draftKg : kgToLbs(draftKg)) * 10) / 10
    : 0

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: points.length > 1 ? 14 : 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>
            {latest ? formatWeight(latest.weightKg, units) : '—'}
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-faint)' }}>
            {latest
              ? `logged ${new Date(latest.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
              : 'no entries yet'}
          </span>
        </div>
        <Button variant="ghost" onClick={openSheet}>
          Log weight
        </Button>
      </div>

      {points.length > 1 && <LineChart points={points} height={150} formatY={(n) => String(n)} />}

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
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
              onClick={() => { haptics.medium(); sound.tick(); setDraftKg((v) => Math.max(20, Math.round(((v ?? 80) - STEP_KG) * 10) / 10)) }}
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
              onClick={() => { haptics.medium(); sound.tick(); setDraftKg((v) => Math.round(((v ?? 80) + STEP_KG) * 10) / 10) }}
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
    </>
  )
}
