import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavStore } from '../../navStore'
import { repo } from '../../data/repo'
import { DEFAULT_SETTINGS } from '../../data/db'
import { detectFormat, exportBackup, importBackup, migrateLegacy } from '../../data/backup'
import { refreshFeedbackSettings, setFeedbackSettings } from '../../ui/feedback'
import { Sheet } from '../../ui/Sheet'
import { Button } from '../../ui/Button'
import { PressScale } from '../../ui/PressScale'
import { toast } from '../../ui/Toast'
import { haptics } from '../../ui/haptics'
import { sound } from '../../ui/sound'
import { plateColor } from '../plate-calc/BarGraphic'
import { ConfirmSheet } from '../train/ConfirmSheet'

// ─── building blocks ─────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        margin: '0 4px 8px',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--text-faint)',
      }}
    >
      {children}
    </div>
  )
}

/** iOS-style grouped rows card. */
function Group({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 22,
      }}
    >
      {children}
    </div>
  )
}

function Row({
  label,
  hint,
  children,
  first,
  stacked,
}: {
  label: string
  hint?: string
  children: ReactNode
  first?: boolean
  stacked?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: stacked ? 'column' : 'row',
        alignItems: stacked ? 'stretch' : 'center',
        justifyContent: 'space-between',
        gap: stacked ? 10 : 12,
        minHeight: 52,
        padding: '10px 14px',
        borderTop: first ? 'none' : '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{label}</span>
        {hint && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}

/** Segmented control, mirrors the plate-calc kg/lbs pattern. */
function Segmented<T extends string>({
  options,
  labels,
  value,
  onChange,
  ariaLabel,
  pillId,
}: {
  options: readonly T[]
  labels?: Partial<Record<T, string>>
  value: T
  onChange: (v: T) => void
  ariaLabel: string
  pillId: string
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        position: 'relative',
        padding: 3,
        borderRadius: 11,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        flexShrink: 0,
      }}
    >
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => {
            if (opt === value) return
            haptics.light()
            sound.tick()
            onChange(opt)
          }}
          aria-pressed={value === opt}
          style={{
            position: 'relative',
            padding: '5px 16px',
            border: 'none',
            background: 'none',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
            color: value === opt ? 'var(--text)' : 'var(--text-dim)',
            cursor: 'pointer',
          }}
        >
          {value === opt && (
            <motion.span
              layoutId={pillId}
              transition={{ type: 'spring', stiffness: 550, damping: 40 }}
              style={{ position: 'absolute', inset: 0, borderRadius: 8, background: 'var(--accent)' }}
            />
          )}
          <span style={{ position: 'relative' }}>{labels?.[opt] ?? opt}</span>
        </button>
      ))}
    </div>
  )
}

/** iOS-style switch with a Motion spring knob. */
function Switch({
  checked,
  onToggle,
  ariaLabel,
}: {
  checked: boolean
  onToggle: () => void
  ariaLabel: string
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onToggle}
      style={{
        flexShrink: 0,
        width: 51,
        height: 31,
        padding: 2,
        borderRadius: 999,
        border: 'none',
        cursor: 'pointer',
        background: checked ? 'var(--success)' : 'var(--border-strong)',
        transition: 'background .2s ease',
        display: 'flex',
        justifyContent: checked ? 'flex-end' : 'flex-start',
      }}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 600, damping: 34 }}
        style={{
          width: 27,
          height: 27,
          borderRadius: '50%',
          background: 'var(--text)',
          boxShadow: '0 2px 6px rgba(0, 0, 0, .35)',
        }}
      />
    </button>
  )
}

function StepButton({
  sign,
  onClick,
  disabled,
  ariaLabel,
}: {
  sign: '+' | '−'
  onClick: () => void
  disabled?: boolean
  ariaLabel: string
}) {
  return (
    <PressScale
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 34,
        height: 34,
        borderRadius: '50%',
        background: 'var(--surface)',
        border: '1px solid var(--border-strong)',
        color: 'var(--accent)',
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
        {sign === '+' ? <path d="M12 5v14M5 12h14" /> : <path d="M5 12h14" />}
      </svg>
    </PressScale>
  )
}

function Stepper({
  display,
  onStep,
  decDisabled,
  incDisabled,
  decLabel,
  incLabel,
}: {
  display: string
  onStep: (dir: 1 | -1) => void
  decDisabled?: boolean
  incDisabled?: boolean
  decLabel: string
  incLabel: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
      <StepButton sign="−" onClick={() => onStep(-1)} disabled={decDisabled} ariaLabel={decLabel} />
      <span
        style={{
          minWidth: 44,
          textAlign: 'center',
          fontSize: 16,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--text)',
        }}
      >
        {display}
      </span>
      <StepButton sign="+" onClick={() => onStep(1)} disabled={incDisabled} ariaLabel={incLabel} />
    </div>
  )
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatMmSs(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Today's date as a local YYYY-MM-DD string. */
function todayIso(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const MIN_BAR_KG = 1
const MAX_BAR_KG = 60
const MIN_REST_SEC = 15
const MAX_REST_SEC = 900
const REST_STEP_SEC = 15

const dateInputStyle: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border-strong)',
  borderRadius: 10,
  color: 'var(--text)',
  colorScheme: 'dark',
  padding: '6px 10px',
  fontSize: 14,
  fontWeight: 600,
  fontFamily: 'inherit',
  outline: 'none',
  flexShrink: 0,
}

interface PendingImport {
  json: string
  format: 'v2' | 'legacy'
}

// ─── SettingsSheet ───────────────────────────────────────────────────────────

/** App settings bottom sheet, opened from the Train tab gear button. */
export function SettingsSheet() {
  const open = useNavStore((s) => s.settingsOpen)
  const closeSettings = useNavStore((s) => s.closeSettings)

  // db is the source of truth — every control writes through repo /
  // setFeedbackSettings and re-renders from this live query.
  const settings = useLiveQuery(() => repo.getSettings(), [])

  const [barDraft, setBarDraft] = useState<string | null>(null)
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const commitBarWeight = () => {
    if (barDraft === null) return
    const v = parseFloat(barDraft.replace(',', '.'))
    if (Number.isFinite(v) && v >= MIN_BAR_KG && v <= MAX_BAR_KG) {
      const rounded = Math.round(v * 100) / 100
      if (rounded !== settings?.barWeightKg) {
        sound.tick()
        void repo.updateSettings({ barWeightKg: rounded })
      }
    }
    setBarDraft(null) // invalid input reverts to the stored value
  }

  const togglePlate = (denom: number) => {
    if (!settings) return
    const has = settings.platesKg.includes(denom)
    if (has && settings.platesKg.length === 1) {
      haptics.warning()
      toast('At least one plate size is required')
      return
    }
    haptics.light()
    sound.tick()
    const next = has
      ? settings.platesKg.filter((p) => p !== denom)
      : [...settings.platesKg, denom].sort((a, b) => b - a)
    void repo.updateSettings({ platesKg: next })
  }

  const stepRest = (dir: 1 | -1) => {
    if (!settings) return
    const next = Math.min(MAX_REST_SEC, Math.max(MIN_REST_SEC, settings.restDefaultSec + dir * REST_STEP_SEC))
    if (next === settings.restDefaultSec) return
    sound.tick()
    void repo.updateSettings({ restDefaultSec: next })
  }

  const stepTarget = (dir: 1 | -1) => {
    if (!settings) return
    const next = Math.min(7, Math.max(1, settings.consistencyTargetPerWeek + dir))
    if (next === settings.consistencyTargetPerWeek) return
    sound.tick()
    void repo.updateSettings({ consistencyTargetPerWeek: next })
  }

  const handleExport = async () => {
    try {
      const json = await exportBackup()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `barbell-pro-backup-${todayIso()}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast('Backup exported')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Export failed')
    }
  }

  const handleFilePicked = async (file: File | undefined) => {
    if (!file) return
    try {
      const json = await file.text()
      const format = detectFormat(json)
      if (format === 'invalid') {
        haptics.warning()
        toast('Not a valid backup file')
        return
      }
      setPendingImport({ json, format })
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not read file')
    }
  }

  const runImport = async () => {
    if (!pendingImport) return
    const { json, format } = pendingImport
    setPendingImport(null)
    try {
      if (format === 'v2') {
        const counts = await importBackup(json)
        await refreshFeedbackSettings() // imported settings may differ
        haptics.success()
        toast(
          `Restored ${counts.weeks} week${counts.weeks === 1 ? '' : 's'}, ` +
          `${counts.setLogs} set${counts.setLogs === 1 ? '' : 's'}`,
        )
      } else {
        await migrateLegacy(json)
        await refreshFeedbackSettings()
        haptics.success()
        toast('Old data imported')
      }
    } catch (err) {
      haptics.warning()
      toast(err instanceof Error ? err.message : 'Import failed')
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={closeSettings}
        title="Settings"
        footer={
          <Button fullWidth onClick={closeSettings}>
            Done
          </Button>
        }
      >
        {settings && (
          <div style={{ paddingBottom: 8 }}>
            {/* ── Units ─────────────────────────────────────────────── */}
            <SectionLabel>Units</SectionLabel>
            <Group>
              <Row first label="Display units" hint="Plates are always kg">
                <Segmented
                  options={['kg', 'lbs'] as const}
                  value={settings.units}
                  onChange={(units) => void repo.updateSettings({ units })}
                  ariaLabel="Display units"
                  pillId="bp-settings-units-pill"
                />
              </Row>
            </Group>

            {/* ── Lifter ────────────────────────────────────────────── */}
            <SectionLabel>Lifter</SectionLabel>
            <Group>
              <Row first label="Sex" hint="Used for DOTS score in Stats">
                <Segmented
                  options={['male', 'female'] as const}
                  labels={{ male: 'Male', female: 'Female' }}
                  value={settings.sex}
                  onChange={(sex) => void repo.updateSettings({ sex })}
                  ariaLabel="Sex"
                  pillId="bp-settings-sex-pill"
                />
              </Row>
            </Group>

            {/* ── Bar & plates ──────────────────────────────────────── */}
            <SectionLabel>Bar &amp; plates</SectionLabel>
            <Group>
              <Row first label="Bar weight" hint="kg">
                <input
                  inputMode="decimal"
                  value={barDraft ?? String(settings.barWeightKg)}
                  onFocus={() => setBarDraft(String(settings.barWeightKg))}
                  onChange={(e) => setBarDraft(e.target.value)}
                  onBlur={commitBarWeight}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') setBarDraft(null)
                  }}
                  aria-label="Bar weight in kilograms"
                  style={{
                    width: 76,
                    textAlign: 'center',
                    background: 'var(--surface)',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 10,
                    color: 'var(--text)',
                    fontSize: 16,
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    padding: '6px 8px',
                    outline: 'none',
                    flexShrink: 0,
                  }}
                />
              </Row>
              <Row stacked label="Available plates" hint="Per side, kg — tap to toggle">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {DEFAULT_SETTINGS.platesKg.map((denom) => {
                    const active = settings.platesKg.includes(denom)
                    return (
                      <button
                        key={denom}
                        onClick={() => togglePlate(denom)}
                        aria-pressed={active}
                        aria-label={`${denom} kilogram plate ${active ? 'enabled' : 'disabled'}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 7,
                          padding: '6px 12px',
                          borderRadius: 999,
                          background: 'var(--surface)',
                          border: `1.5px solid ${active ? plateColor(denom) : 'var(--border)'}`,
                          fontSize: 13,
                          fontWeight: 700,
                          fontVariantNumeric: 'tabular-nums',
                          color: active ? 'var(--text)' : 'var(--text-faint)',
                          opacity: active ? 1 : 0.55,
                          cursor: 'pointer',
                          transition: 'opacity .15s ease, border-color .15s ease',
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 9,
                            height: 9,
                            borderRadius: '50%',
                            background: plateColor(denom),
                            // faint ring keeps the dark 2.5 kg dot visible
                            boxShadow: '0 0 0 1px var(--text-faint)',
                            flexShrink: 0,
                          }}
                        />
                        {denom}
                      </button>
                    )
                  })}
                </div>
              </Row>
            </Group>

            {/* ── Feedback ──────────────────────────────────────────── */}
            <SectionLabel>Feedback</SectionLabel>
            <Group>
              <Row first label="Sound">
                <Switch
                  checked={settings.sound}
                  onToggle={() => {
                    const next = !settings.sound
                    setFeedbackSettings({ sound: next })
                    haptics.light()
                    if (next) sound.tick()
                  }}
                  ariaLabel="Sound effects"
                />
              </Row>
              <Row label="Haptics">
                <Switch
                  checked={settings.haptics}
                  onToggle={() => {
                    const next = !settings.haptics
                    setFeedbackSettings({ haptics: next })
                    if (next) haptics.medium()
                    sound.tick()
                  }}
                  ariaLabel="Haptic feedback"
                />
              </Row>
            </Group>

            {/* ── Rest timer ────────────────────────────────────────── */}
            <SectionLabel>Rest timer</SectionLabel>
            <Group>
              <Row first label="Default rest">
                <Stepper
                  display={formatMmSs(settings.restDefaultSec)}
                  onStep={stepRest}
                  decDisabled={settings.restDefaultSec <= MIN_REST_SEC}
                  incDisabled={settings.restDefaultSec >= MAX_REST_SEC}
                  decLabel="Decrease default rest by 15 seconds"
                  incLabel="Increase default rest by 15 seconds"
                />
              </Row>
            </Group>

            {/* ── Consistency ───────────────────────────────────────── */}
            <SectionLabel>Consistency</SectionLabel>
            <Group>
              <Row first label="Target sessions" hint="Per week">
                <Stepper
                  display={String(settings.consistencyTargetPerWeek)}
                  onStep={stepTarget}
                  decDisabled={settings.consistencyTargetPerWeek <= 1}
                  incDisabled={settings.consistencyTargetPerWeek >= 7}
                  decLabel="Decrease weekly session target"
                  incLabel="Increase weekly session target"
                />
              </Row>
              <Row label="Start date" hint="Streaks count from here">
                <input
                  type="date"
                  value={settings.consistencyStartDate}
                  onChange={(e) => {
                    if (!e.target.value) return
                    sound.tick()
                    void repo.updateSettings({ consistencyStartDate: e.target.value })
                  }}
                  aria-label="Consistency start date"
                  style={dateInputStyle}
                />
              </Row>
            </Group>

            {/* ── Data ──────────────────────────────────────────────── */}
            <SectionLabel>Data</SectionLabel>
            <Group>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14 }}>
                <Button variant="ghost" fullWidth onClick={() => void handleExport()}>
                  Export backup
                </Button>
                <Button
                  variant="ghost"
                  fullWidth
                  onClick={() => fileInputRef.current?.click()}
                >
                  Import backup
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  aria-label="Backup file"
                  onChange={(e) => {
                    void handleFilePicked(e.target.files?.[0])
                    e.target.value = '' // allow re-picking the same file
                  }}
                  style={{ display: 'none' }}
                />
              </div>
            </Group>
          </div>
        )}
      </Sheet>

      <ConfirmSheet
        open={pendingImport !== null}
        title={pendingImport?.format === 'legacy' ? 'Import old data?' : 'Restore backup?'}
        message={
          pendingImport?.format === 'legacy'
            ? "Adds the old app's data to your current data. Nothing is deleted."
            : 'Replaces ALL current data — weeks, sets, lifts, notes and settings. This cannot be undone.'
        }
        confirmLabel={pendingImport?.format === 'legacy' ? 'Import' : 'Replace everything'}
        onConfirm={() => void runImport()}
        onClose={() => setPendingImport(null)}
      />
    </>
  )
}
