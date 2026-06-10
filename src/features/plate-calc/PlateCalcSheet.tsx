import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { useNavStore } from '../../navStore'
import { repo } from '../../data/repo'
import { DEFAULT_SETTINGS, type Settings } from '../../data/db'
import { computePlates, formatWeight, kgToLbs, lbsToKg } from '../../lib/plateMath'
import { Sheet } from '../../ui/Sheet'
import { Button } from '../../ui/Button'
import { PressScale } from '../../ui/PressScale'
import { RollingNumber } from '../../ui/RollingNumber'
import { haptics } from '../../ui/haptics'
import { sound } from '../../ui/sound'
import { BarGraphic, plateColor } from './BarGraphic'

export const LAST_CALC_WEIGHT_KEY = 'bp_lastCalcWeight'

const MIN_KG = 0
const MAX_KG = 600
const STEP_KG = 2.5

function clampKg(v: number): number {
  return Math.min(MAX_KG, Math.max(MIN_KG, Math.round(v * 100) / 100))
}

function StepButton({ sign, onClick }: { sign: '+' | '−'; onClick: () => void }) {
  return (
    <PressScale
      onClick={onClick}
      aria-label={sign === '+' ? 'Increase weight by 2.5 kilograms' : 'Decrease weight by 2.5 kilograms'}
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 54,
        height: 54,
        borderRadius: '50%',
        background: 'var(--surface-2)',
        border: '1px solid var(--border-strong)',
        color: 'var(--accent)',
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
        {sign === '+' ? <path d="M12 5v14M5 12h14" /> : <path d="M5 12h14" />}
      </svg>
    </PressScale>
  )
}

/**
 * Plate calculator bottom sheet. Internal state is ALWAYS kg — the kg/lbs
 * toggle only converts the readout. Opens via navStore.openPlateCalc(kg).
 */
export function PlateCalcSheet() {
  const plateCalcKg = useNavStore((s) => s.plateCalcKg)
  const closePlateCalc = useNavStore((s) => s.closePlateCalc)
  const open = plateCalcKg !== null

  const [kg, setKg] = useState(60)
  const [units, setUnits] = useState<'kg' | 'lbs'>('kg')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState('')
  const [seededDraft, setSeededDraft] = useState('')

  // On open: seed the target and re-read settings (they change rarely).
  useEffect(() => {
    if (plateCalcKg === null) return
    setKg(clampKg(plateCalcKg))
    setTyping(false)
    void repo.getSettings().then((s) => {
      setSettings(s)
      setUnits(s.units)
    })
  }, [plateCalcKg])

  // Remember the last target for the standalone (header-button) open.
  useEffect(() => {
    if (open) localStorage.setItem(LAST_CALC_WEIGHT_KEY, String(kg))
  }, [open, kg])

  const barWeightKg = settings?.barWeightKg ?? DEFAULT_SETTINGS.barWeightKg
  const platesKg = settings?.platesKg ?? DEFAULT_SETTINGS.platesKg
  const { perSide, achieved, remainder } = computePlates(kg, barWeightKg, platesKg)

  // Display conversion only — math above stays kg.
  const displayValue = Math.round((units === 'lbs' ? kgToLbs(kg) : kg) * 10) / 10
  const decimals = Number.isInteger(displayValue) ? 0 : 1

  const step = (delta: number) => {
    sound.tick()
    setKg((k) => clampKg(k + delta))
  }

  const commitDraft = (withUnits: 'kg' | 'lbs') => {
    // Skip commit when the user never changed the seeded value — avoids
    // lbs round-trip drift (e.g. "100" lbs → lbsToKg → 100.02 kg).
    if (draft !== seededDraft) {
      const v = parseFloat(draft.replace(',', '.'))
      if (Number.isFinite(v) && v >= 0) {
        setKg(clampKg(withUnits === 'lbs' ? lbsToKg(v) : v))
      }
    }
    setTyping(false)
  }

  const beginTyping = () => {
    const seeded = String(displayValue)
    setSeededDraft(seeded)
    setDraft(seeded)
    setTyping(true)
  }

  // Group perSide (already heaviest-first) into denom × count chips.
  const groups: Array<{ denom: number; count: number }> = []
  for (const p of perSide) {
    const last = groups[groups.length - 1]
    if (last && last.denom === p) last.count++
    else groups.push({ denom: p, count: 1 })
  }

  return (
    <Sheet
      open={open}
      onClose={closePlateCalc}
      title="Plate Calculator"
      footer={
        <Button fullWidth onClick={closePlateCalc}>
          Done
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, paddingBottom: 6 }}>
        {/* − [readout] + */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, width: '100%', marginTop: 2 }}>
          <StepButton sign="−" onClick={() => step(-STEP_KG)} />
          <div style={{ minWidth: 178, display: 'flex', justifyContent: 'center' }}>
            {typing ? (
              <input
                autoFocus
                inputMode="decimal"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => commitDraft(units)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitDraft(units)
                  if (e.key === 'Escape') setTyping(false)
                }}
                aria-label={`Target weight in ${units}`}
                style={{
                  width: 170,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '2px solid var(--accent)',
                  outline: 'none',
                  textAlign: 'center',
                  fontSize: 46,
                  fontWeight: 800,
                  letterSpacing: '-0.03em',
                  color: 'var(--text)',
                  fontVariantNumeric: 'tabular-nums',
                  padding: 0,
                }}
              />
            ) : (
              <PressScale
                onClick={beginTyping}
                aria-label={`Target weight ${displayValue} ${units} — tap to type a value`}
                style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6 }}
              >
                <RollingNumber
                  value={displayValue}
                  decimals={decimals}
                  style={{ fontSize: 52, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)' }}
                />
                <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-dim)' }}>{units}</span>
              </PressScale>
            )}
          </div>
          <StepButton sign="+" onClick={() => step(STEP_KG)} />
        </div>

        {/* kg / lbs display toggle (conversion only) */}
        <div
          role="group"
          aria-label="Display units"
          style={{
            display: 'flex',
            position: 'relative',
            padding: 3,
            borderRadius: 11,
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
          }}
        >
          {(['kg', 'lbs'] as const).map((u) => (
            <button
              key={u}
              onClick={() => {
                if (u === units) return
                haptics.light()
                if (typing) commitDraft(units)
                setUnits(u)
              }}
              aria-pressed={units === u}
              style={{
                position: 'relative',
                padding: '5px 20px',
                border: 'none',
                background: 'none',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                color: units === u ? 'var(--text)' : 'var(--text-dim)',
                cursor: 'pointer',
              }}
            >
              {units === u && (
                <motion.span
                  layoutId="bp-plate-unit-pill"
                  transition={{ type: 'spring', stiffness: 550, damping: 40 }}
                  style={{ position: 'absolute', inset: 0, borderRadius: 8, background: 'var(--accent)' }}
                />
              )}
              <span style={{ position: 'relative' }}>{u}</span>
            </button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: -8 }}>
          Tap the number to type · plates are kg
        </span>

        <BarGraphic perSide={perSide} barWeightKg={barWeightKg} />

        {/* per-side plate chips */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-faint)' }}>
            PER SIDE
          </span>
          {groups.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
                {groups.map((g) => (
                  <span
                    key={g.denom}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7,
                      padding: '4px 11px',
                      borderRadius: 999,
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      fontSize: 13,
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                      color: 'var(--text)',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: plateColor(g.denom),
                        // text-faint ring keeps the dark 2.5 kg dot visible
                        boxShadow: '0 0 0 1px var(--text-faint)',
                        flexShrink: 0,
                      }}
                    />
                    {g.denom} ×{g.count}
                  </span>
                ))}
              </div>
            </div>
          ) : kg < barWeightKg ? (
            <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              Bar alone is {formatWeight(barWeightKg, units)} — above your target
            </span>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>Empty bar — no plates needed</span>
          )}
        </div>

        {/* remainder warning when the target isn't exactly loadable.
            Threshold 0.05 kg avoids "0 lbs short" noise from display rounding. */}
        {remainder >= 0.05 && (
          <div
            role="status"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              borderRadius: 10,
              background: 'var(--surface-2)',
              border: '1px solid var(--border-strong)',
              color: 'var(--gold)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <path d="M12 9v4M12 17h.01" />
            </svg>
            {formatWeight(remainder, units)} short — closest loadable: {formatWeight(achieved, units)}
          </div>
        )}
      </div>
    </Sheet>
  )
}
