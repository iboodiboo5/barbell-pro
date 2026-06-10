import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { db, type Exercise, type Lift } from '../../data/db'
import { repo } from '../../data/repo'
import { resolveLift, searchLifts } from '../../data/liftCatalog'
import { kgToLbs, lbsToKg } from '../../lib/plateMath'
import { Button } from '../../ui/Button'
import { PressScale } from '../../ui/PressScale'
import { RollingNumber } from '../../ui/RollingNumber'
import { Sheet } from '../../ui/Sheet'
import { haptics } from '../../ui/haptics'
import { sound } from '../../ui/sound'

interface ExerciseFormProps {
  open: boolean
  onClose: () => void
  dayId: string
  units: 'kg' | 'lbs'
  /** When set, the form edits this exercise; otherwise it creates a new one. */
  exercise?: Exercise | null
  /** Called when the user taps Delete in edit mode; the owner decides whether to confirm. */
  onDelete?: (exercise: Exercise) => void
}

const fieldLabelStyle: CSSProperties = {
  display: 'block',
  marginBottom: 8,
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-faint)',
}

const inputStyle: CSSProperties = {
  width: '100%',
  height: 48,
  padding: '0 14px',
  borderRadius: 12,
  border: '1px solid var(--border-strong)',
  background: 'var(--surface-2)',
  color: 'var(--text)',
  fontSize: 16,
  outline: 'none',
}

function Stepper({
  label,
  value,
  min,
  onChange,
}: {
  label: string
  value: number
  min: number
  onChange: (next: number) => void
}) {
  const step = (delta: number) => {
    const next = value + delta
    if (next < min) return
    haptics.medium()
    sound.tick()
    onChange(next)
  }

  const buttonStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    borderRadius: '50%',
    background: 'var(--surface-2)',
    border: '1px solid var(--border-strong)',
    color: 'var(--text)',
  }

  return (
    <div style={{ flex: 1 }}>
      <span style={fieldLabelStyle}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <PressScale onClick={() => step(-1)} aria-label={`Decrease ${label}`} style={buttonStyle}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M5 12h14" />
          </svg>
        </PressScale>
        <RollingNumber value={value} style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' }} />
        <PressScale onClick={() => step(1)} aria-label={`Increase ${label}`} style={buttonStyle}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </PressScale>
      </div>
    </div>
  )
}

export function ExerciseForm({ open, onClose, dayId, units, exercise, onDelete }: ExerciseFormProps) {
  const [name, setName] = useState('')
  const [load, setLoad] = useState('')
  // The load string as hydrated on open. If the user never edits it we keep
  // the stored kg value untouched, so lbs display rounding can't drift the
  // saved load on every edit round-trip.
  const initialLoad = useRef<string | null>(null)
  const [sets, setSets] = useState(3)
  const [reps, setReps] = useState(5)
  const [remarks, setRemarks] = useState<string[]>([])
  const [remarkInput, setRemarkInput] = useState('')
  const [results, setResults] = useState<Lift[]>([])
  // After picking a suggestion (or prefilling in edit mode) the dropdown stays
  // hidden until the user types again.
  const [picked, setPicked] = useState(false)
  const [saving, setSaving] = useState(false)

  const editing = !!exercise

  // (Re)hydrate fields each time the sheet opens.
  useEffect(() => {
    if (!open) return
    setRemarkInput('')
    setResults([])
    setSaving(false)
    setPicked(true)
    if (exercise) {
      const display = units === 'lbs' ? kgToLbs(exercise.plannedLoad) : exercise.plannedLoad
      const loadStr = String(Math.round(display * 10) / 10)
      setLoad(loadStr)
      initialLoad.current = loadStr
      setSets(exercise.plannedSets)
      setReps(exercise.plannedReps)
      setRemarks([...exercise.remarks])
      setName('')
      void db.lifts.get(exercise.liftId).then((lift) => {
        // Hydration is async — never clobber text the user already typed.
        if (lift) setName((current) => (current === '' ? lift.name : current))
      })
    } else {
      setName('')
      setLoad('')
      initialLoad.current = null
      setSets(3)
      setReps(5)
      setRemarks([])
    }
  }, [open, exercise, units])

  // Live autocomplete against the lift catalog.
  useEffect(() => {
    if (!open || picked || !name.trim()) {
      setResults([])
      return
    }
    let cancelled = false
    void searchLifts(name).then((lifts) => {
      if (!cancelled) setResults(lifts.slice(0, 5))
    })
    return () => {
      cancelled = true
    }
  }, [name, picked, open])

  const trimmedName = name.trim()
  const loadValue = load.trim() === '' ? 0 : Number(load)
  const valid = trimmedName.length > 0 && Number.isFinite(loadValue) && loadValue >= 0 && sets >= 1 && reps >= 1

  const addRemark = () => {
    const text = remarkInput.trim()
    if (!text) return
    haptics.light()
    setRemarks((prev) => [...prev, text])
    setRemarkInput('')
  }

  const save = async () => {
    if (!valid || saving) return
    setSaving(true)
    try {
      const lift = await resolveLift(trimmedName)
      // Only run the units→kg conversion when the load string actually
      // changed; re-converting the rounded display value would drift the
      // stored kg load a little on every lbs edit round-trip.
      const loadUntouched = exercise != null && load.trim() === initialLoad.current
      const repsUntouched = exercise != null && reps === exercise.plannedReps
      const loadKg = units === 'lbs' ? lbsToKg(loadValue) : loadValue
      const data = {
        liftId: lift.id,
        plannedLoad: loadUntouched ? exercise.plannedLoad : Math.round(loadKg * 100) / 100,
        plannedSets: sets,
        plannedReps: reps,
        remarks,
        // a numeric edit overrides imported display text ("30lb", "AMRAP @7-8")
        ...(loadUntouched ? {} : { loadText: undefined }),
        ...(repsUntouched ? {} : { repsText: undefined }),
      }
      if (exercise) await repo.updateExercise(exercise.id, data)
      else await repo.addExercise(dayId, data)
      sound.complete()
      haptics.success()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const showDropdown = !picked && trimmedName.length > 0

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Exercise' : 'New Exercise'}
      footer={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button fullWidth onClick={() => void save()} disabled={!valid || saving}>
            {editing ? 'Save Changes' : 'Add Exercise'}
          </Button>
          {editing && (
            <Button
              variant="ghost"
              fullWidth
              onClick={() => {
                onClose()
                // The owner counts logged sets and confirms before deleting.
                onDelete?.(exercise)
              }}
              style={{ color: 'var(--danger)', border: '1px solid transparent' }}
            >
              Delete Exercise
            </Button>
          )}
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 8 }}>
        {/* Lift name + autocomplete */}
        <div style={{ position: 'relative' }}>
          <label htmlFor="exercise-name" style={fieldLabelStyle}>
            Lift
          </label>
          <input
            id="exercise-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setPicked(false)
            }}
            placeholder="e.g. Bench Press"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            style={inputStyle}
          />
          <AnimatePresence>
            {showDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 10,
                  marginTop: 6,
                  borderRadius: 12,
                  border: '1px solid var(--border-strong)',
                  background: 'var(--surface-2)',
                  boxShadow: '0 12px 32px rgba(0,0,0,.5)',
                  overflow: 'hidden',
                }}
              >
                {results.map((lift) => (
                  <button
                    key={lift.id}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => {
                      haptics.light()
                      setName(lift.name)
                      setPicked(true)
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '12px 14px',
                      border: 'none',
                      borderBottom: '1px solid var(--border)',
                      background: 'none',
                      textAlign: 'left',
                      color: 'var(--text)',
                      fontSize: 15,
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    {lift.name}
                  </button>
                ))}
                {results.length === 0 && (
                  <button
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => {
                      haptics.light()
                      setPicked(true)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '12px 14px',
                      border: 'none',
                      background: 'none',
                      textAlign: 'left',
                      color: 'var(--text-dim)',
                      fontSize: 14,
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ color: 'var(--accent)', fontWeight: 700 }}>+</span>
                    Create “{trimmedName}”
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Load */}
        <div>
          <label htmlFor="exercise-load" style={fieldLabelStyle}>
            Load ({units})
          </label>
          <input
            id="exercise-load"
            value={load}
            onChange={(e) => setLoad(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            autoComplete="off"
            style={{ ...inputStyle, fontVariantNumeric: 'tabular-nums' }}
          />
        </div>

        {/* Sets × Reps steppers */}
        <div style={{ display: 'flex', gap: 24 }}>
          <Stepper label="Sets" value={sets} min={1} onChange={setSets} />
          <Stepper label="Reps" value={reps} min={1} onChange={setReps} />
        </div>

        {/* Remarks */}
        <div>
          <label htmlFor="exercise-remark" style={fieldLabelStyle}>
            Remarks
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              id="exercise-remark"
              value={remarkInput}
              onChange={(e) => setRemarkInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addRemark()
                }
              }}
              placeholder="e.g. paused, 3s eccentric"
              autoComplete="off"
              style={{ ...inputStyle, flex: 1 }}
            />
            <PressScale
              onClick={addRemark}
              aria-label="Add remark"
              style={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'var(--surface-2)',
                border: '1px solid var(--border-strong)',
                color: 'var(--accent)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </PressScale>
          </div>
          {remarks.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              <AnimatePresence initial={false}>
                {remarks.map((remark, i) => (
                  <motion.span
                    key={`${remark}-${i}`}
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 8px 6px 12px',
                      borderRadius: 999,
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border-strong)',
                      color: 'var(--text-dim)',
                      fontSize: 13,
                    }}
                  >
                    {remark}
                    <button
                      onClick={() => {
                        haptics.light()
                        setRemarks((prev) => prev.filter((_, j) => j !== i))
                      }}
                      aria-label={`Remove remark ${remark}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 18,
                        height: 18,
                        padding: 0,
                        borderRadius: '50%',
                        border: 'none',
                        background: 'var(--border-strong)',
                        color: 'var(--text-dim)',
                        cursor: 'pointer',
                      }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  )
}
