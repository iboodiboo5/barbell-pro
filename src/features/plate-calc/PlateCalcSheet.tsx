import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { useNavStore } from '../../navStore'
import { repo } from '../../data/repo'
import { DEFAULT_SETTINGS, type Settings } from '../../data/db'
import {
  autoStack, formatWeight, insertPlate, kgToLbs, LB_PLATES, lbsToKg,
  removePlate, stackTotalKg, type PlateSel,
} from '../../lib/plateMath'
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

  // Editable per-side stack. Target/settings changes reset it to the greedy kg
  // suggestion; palette taps only touch the stack, so manual edits survive.
  const [perSide, setPerSide] = useState<PlateSel[]>([])
  useEffect(() => {
    if (!open) return
    setPerSide(autoStack(kg, barWeightKg, platesKg))
    // `settings` stands in for barWeightKg/platesKg (loaded once per open)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kg, settings])

  const totalKg = stackTotalKg(barWeightKg, perSide)
  const deltaKg = totalKg - kg

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

  // Group perSide (already heaviest-first) into denom+unit × count chips.
  const groups: Array<{ plate: PlateSel; count: number }> = []
  for (const p of perSide) {
    const last = groups[groups.length - 1]
    if (last && last.plate.value === p.value && last.plate.unit === p.unit) last.count++
    else groups.push({ plate: { ...p }, count: 1 })
  }

  const addPlate = (plate: PlateSel) => {
    haptics.light()
    sound.tick()
    setPerSide((s) => insertPlate(s, plate))
  }

  const dropPlate = (plate: PlateSel) => {
    haptics.light()
    sound.tick()
    setPerSide((s) => removePlate(s, plate))
  }

  // Loaded total, display conversion only.
  const totalDisplay = Math.round((units === 'lbs' ? kgToLbs(totalKg) : totalKg) * 10) / 10
  const totalAlt = formatWeight(totalKg, units === 'kg' ? 'lbs' : 'kg')

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
          Tap the number to type · target auto-loads kg plates
        </span>

        <BarGraphic perSide={perSide} barWeightKg={barWeightKg} />

        {/* loaded total (the real number for mixed kg/lb stacks) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, marginTop: -6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-faint)' }}>
            LOADED
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <RollingNumber
              value={totalDisplay}
              decimals={Number.isInteger(totalDisplay) ? 0 : 1}
              style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}
            />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-dim)' }}>{units}</span>
            <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>= {totalAlt}</span>
          </div>
          {Math.abs(deltaKg) >= 0.05 && (
            <span
              role="status"
              style={{
                marginTop: 4,
                padding: '3px 10px',
                borderRadius: 999,
                background: 'var(--surface-2)',
                border: '1px solid var(--border-strong)',
                color: 'var(--gold)',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {formatWeight(Math.abs(deltaKg), units)} {deltaKg < 0 ? 'short of' : 'over'} target
            </span>
          )}
        </div>

        {/* per-side plate chips — tap to remove one */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-faint)' }}>
            PER SIDE · TAP TO REMOVE
          </span>
          {groups.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
              {groups.map((g) => (
                <PressScale
                  key={`${g.plate.value}-${g.plate.unit}`}
                  onClick={() => dropPlate(g.plate)}
                  aria-label={`Remove one ${g.plate.value} ${g.plate.unit} plate per side`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '6px 12px',
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
                      background: plateColor(g.plate.value, g.plate.unit),
                      // text-faint ring keeps the dark 2.5 kg dot visible
                      boxShadow: '0 0 0 1px var(--text-faint)',
                      flexShrink: 0,
                    }}
                  />
                  {g.plate.value} {g.plate.unit} ×{g.count}
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                    <path d="M5 12h14" />
                  </svg>
                </PressScale>
              ))}
            </div>
          ) : kg < barWeightKg ? (
            <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              Bar alone is {formatWeight(barWeightKg, units)} — above your target
            </span>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>Empty bar — no plates loaded</span>
          )}
        </div>

        {/* palette — mixed-plate gyms: add kg and lb plates freely */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-faint)' }}>
            ADD PLATES
          </span>
          {([
            { unit: 'kg' as const, values: platesKg },
            { unit: 'lb' as const, values: LB_PLATES },
          ]).map(({ unit, values }) => (
            <div key={unit} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
              <span style={{ width: 20, fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textAlign: 'right' }}>
                {unit}
              </span>
              {values.map((value) => (
                <PressScale
                  key={value}
                  onClick={() => addPlate({ value, unit })}
                  aria-label={`Add one ${value} ${unit} plate per side`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 10px',
                    borderRadius: 10,
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border-strong)',
                    fontSize: 13,
                    fontWeight: 700,
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
                      background: plateColor(value, unit),
                      boxShadow: '0 0 0 1px var(--text-faint)',
                      flexShrink: 0,
                    }}
                  />
                  {value}
                </PressScale>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  )
}
