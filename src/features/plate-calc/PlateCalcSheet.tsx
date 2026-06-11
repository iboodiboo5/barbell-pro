import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
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

const MAX_KG = 600
const STEP_KG = 2.5

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
        width: 46,
        height: 46,
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
 * Plate calculator bottom sheet. The per-side stack is the single source of
 * truth: the big number always shows what's actually on the bar (kg internal,
 * displayed in the settings units). + / − and typing re-auto-stack kg plates
 * to the new number; palette taps edit the stack directly, mixing kg and lb.
 */
export function PlateCalcSheet() {
  const plateCalcKg = useNavStore((s) => s.plateCalcKg)
  const closePlateCalc = useNavStore((s) => s.closePlateCalc)
  const open = plateCalcKg !== null

  const [settings, setSettings] = useState<Settings | null>(null)
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState('')
  const [seededDraft, setSeededDraft] = useState('')

  // Re-read settings on every open (they change rarely).
  useEffect(() => {
    if (plateCalcKg === null) return
    setTyping(false)
    void repo.getSettings().then(setSettings)
  }, [plateCalcKg])

  const units = settings?.units ?? DEFAULT_SETTINGS.units
  const barWeightKg = settings?.barWeightKg ?? DEFAULT_SETTINGS.barWeightKg
  const platesKg = settings?.platesKg ?? DEFAULT_SETTINGS.platesKg

  // Editable per-side stack — seeded from the opening weight, then only ever
  // changed by the user (steppers, typing, palette taps).
  const [perSide, setPerSide] = useState<PlateSel[]>([])
  useEffect(() => {
    if (plateCalcKg === null) return
    setPerSide(autoStack(Math.min(MAX_KG, plateCalcKg), barWeightKg, platesKg))
    // `settings` stands in for barWeightKg/platesKg (loaded once per open)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plateCalcKg, settings])

  const totalKg = stackTotalKg(barWeightKg, perSide)

  // Remember the last loaded weight for the standalone (header-button) open.
  useEffect(() => {
    if (open) localStorage.setItem(LAST_CALC_WEIGHT_KEY, String(totalKg))
  }, [open, totalKg])

  // Display conversion only — math above stays kg.
  const displayValue = Math.round((units === 'lbs' ? kgToLbs(totalKg) : totalKg) * 10) / 10
  const decimals = Number.isInteger(displayValue) ? 0 : 1

  const restackTo = (targetKg: number) => {
    const clamped = Math.min(MAX_KG, Math.max(barWeightKg, Math.round(targetKg * 100) / 100))
    setPerSide(autoStack(clamped, barWeightKg, platesKg))
  }

  const step = (delta: number) => {
    sound.tick()
    restackTo(totalKg + delta)
  }

  const commitDraft = () => {
    // Skip commit when the user never changed the seeded value — avoids
    // lbs round-trip drift (e.g. "100" lbs → lbsToKg → 100.02 kg).
    if (draft !== seededDraft) {
      const v = parseFloat(draft.replace(',', '.'))
      if (Number.isFinite(v) && v >= 0) {
        restackTo(units === 'lbs' ? lbsToKg(v) : v)
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
        {/* − [loaded weight] + */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, width: '100%', marginTop: 2 }}>
          <StepButton sign="−" onClick={() => step(-STEP_KG)} />
          <div style={{ minWidth: 178, display: 'flex', justifyContent: 'center' }}>
            {typing ? (
              <input
                autoFocus
                inputMode="decimal"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitDraft}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitDraft()
                  if (e.key === 'Escape') setTyping(false)
                }}
                aria-label={`Weight in ${units}`}
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
                aria-label={`Loaded weight ${displayValue} ${units} — tap to type a value`}
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
        <span style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: -8 }}>
          Tap the number to type · tap plates below to load them
        </span>

        <BarGraphic perSide={perSide} barWeightKg={barWeightKg} />

        {/* on-the-bar rail — fixed height + single line so adding/removing
            plates never shifts the palette and Done button below it */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: '100%' }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-faint)' }}>
            ON THE BAR · TAP TO REMOVE
          </span>
          <div
            className="no-scrollbar"
            style={{ width: '100%', height: 38, overflowX: 'auto', overflowY: 'hidden' }}
          >
            {groups.length > 0 ? (
              // max-content + auto margins: centered while the chips fit,
              // horizontally scrollable once they overflow — never wraps.
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: '100%', width: 'max-content', margin: '0 auto', padding: '0 16px' }}>
                <AnimatePresence initial={false}>
                  {groups.map((g) => (
                    <motion.span
                      key={`${g.plate.value}-${g.plate.unit}`}
                      layout
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                      style={{ display: 'inline-flex', flexShrink: 0 }}
                    >
                      <PressScale
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
                          whiteSpace: 'nowrap',
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
                    </motion.span>
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                  Empty bar — {formatWeight(barWeightKg, units)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* palette — mixed-plate gyms: add kg and lb plates freely. Uniform
            neutral cards keep the grid calm; the plate color is just a small
            tick under the value. Both unit rows share one 7-column grid so kg
            and lb cards align column-for-column (extra plates wrap onto
            further aligned grid rows). */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
          <span style={{ alignSelf: 'center', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-faint)' }}>
            ADD PLATES
          </span>
          {([
            { unit: 'kg' as const, values: platesKg },
            { unit: 'lb' as const, values: LB_PLATES },
          ]).map(({ unit, values }) => (
            <div key={unit} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', paddingLeft: 2 }}>
                {unit}
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                {values.map((value) => {
                  const tick = plateColor(value, unit)
                  return (
                    <PressScale
                      key={value}
                      onClick={() => addPlate({ value, unit })}
                      aria-label={`Add one ${value} ${unit} plate per side`}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        width: '100%',
                        height: 48,
                        borderRadius: 12,
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border-strong)',
                        fontSize: String(value).length > 3 ? 12 : 13,
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                        color: 'var(--text)',
                      }}
                    >
                      {value}
                      <span
                        aria-hidden="true"
                        style={{
                          width: 16,
                          height: 3,
                          borderRadius: 2,
                          background: tick,
                          // keep the near-black 2.5 kg / 15 lb tick visible
                          boxShadow: tick === 'var(--plate-2-5)' ? '0 0 0 1px var(--overlay-light)' : undefined,
                        }}
                      />
                    </PressScale>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  )
}
