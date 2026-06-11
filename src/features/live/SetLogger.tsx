import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import type { Exercise, SetLog } from '../../data/db'
import { repo } from '../../data/repo'
import { formatWeight, kgToLbs } from '../../lib/plateMath'
import { useNavStore } from '../../navStore'
import { PressScale } from '../../ui/PressScale'
import { RollingNumber } from '../../ui/RollingNumber'
import { Confetti } from '../../ui/Confetti'
import { haptics } from '../../ui/haptics'
import { sound } from '../../ui/sound'
import { lastSessionFor, useLiveStore } from './liveStore'

const WEIGHT_STEP_KG = 2.5

function StepRound({
  sign,
  onClick,
  ariaLabel,
}: {
  sign: '+' | '−'
  onClick: () => void
  ariaLabel: string
}) {
  return (
    <PressScale
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 44,
        height: 44,
        borderRadius: '50%',
        background: 'var(--surface)',
        border: '1px solid var(--border-strong)',
        color: 'var(--accent)',
        flexShrink: 0,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
        {sign === '+' ? <path d="M12 5v14M5 12h14" /> : <path d="M5 12h14" />}
      </svg>
    </PressScale>
  )
}

/** Compact "Last: 137.5 kg × 5 × 3" summary of the most recent prior session. */
function describeLast(sets: SetLog[], units: 'kg' | 'lbs'): string | null {
  if (sets.length === 0) return null
  // Most common (weight, reps) pair keeps the line readable for mixed sessions.
  const top = new Map<string, { weight: number; reps: number; n: number }>()
  for (const s of sets) {
    const k = `${s.weight}x${s.reps}`
    const e = top.get(k) ?? { weight: s.weight, reps: s.reps, n: 0 }
    e.n += 1
    top.set(k, e)
  }
  const best = [...top.values()].sort((a, b) => b.n - a.n)[0]
  return `Last: ${formatWeight(best.weight, units)} × ${best.reps} × ${best.n}`
}

interface SetLoggerProps {
  exercise: Exercise
  /** Only the active pager page reacts to PR celebration + plays feedback. */
  active: boolean
  isLast: boolean
  onFinish: () => void
}

export function SetLogger({ exercise, active, isLast, onFinish }: SetLoggerProps) {
  const session = useLiveStore((s) => s.session)
  const setCount = useLiveStore((s) => s.setCounts[exercise.id] ?? 0)
  const logSet = useLiveStore((s) => s.logSet)
  const openPlateCalc = useNavStore((s) => s.openPlateCalc)
  const openLift = useNavStore((s) => s.openLift)

  const [weight, setWeight] = useState(exercise.plannedLoad)
  const [reps, setReps] = useState(exercise.plannedReps)
  const [showPR, setShowPR] = useState(false)
  const [lastLine, setLastLine] = useState<string | null>(null)

  const lift = useLiveQuery(() => db.lifts.get(exercise.liftId), [exercise.liftId])
  const settings = useLiveQuery(() => repo.getSettings(), [])
  const units = settings?.units ?? 'kg'

  const startedAt = session?.startedAt ?? 0
  const ownSets = useLiveQuery(
    async () => {
      const sets = await db.setLogs.where('exerciseId').equals(exercise.id).toArray()
      return sets.filter((s) => s.completedAt >= startedAt).sort((a, b) => a.completedAt - b.completedAt)
    },
    [exercise.id, startedAt],
  )

  useEffect(() => {
    let cancelled = false
    if (!session) return
    void lastSessionFor(exercise.liftId, session.dayId).then((sets) => {
      if (!cancelled) setLastLine(describeLast(sets, units))
    })
    return () => {
      cancelled = true
    }
  }, [exercise.liftId, session, units])

  const setsDone = setCount >= exercise.plannedSets
  const currentSet = Math.min(setCount + 1, exercise.plannedSets)

  const handleLog = async () => {
    const { isPR, exerciseDone } = await logSet({ weight, reps })
    sound.complete()
    haptics.success()
    if (isPR) {
      sound.pr()
      setShowPR(true)
    }
    if (exerciseDone && !isLast) {
      // Last planned set: auto-advance the pager once the completion feedback
      // has landed — unless the user already swiped somewhere else.
      const fromIndex = useLiveStore.getState().currentIndex
      setTimeout(() => {
        const store = useLiveStore.getState()
        if (store.session && store.currentIndex === fromIndex) {
          haptics.light()
          store.setCurrentIndex(fromIndex + 1)
        }
      }, 900)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 18,
        padding: '12px 24px 24px',
        position: 'relative',
        minHeight: '100%',
      }}
    >
      {/* lift name — deep link to its history */}
      <PressScale
        onClick={lift ? () => openLift(lift.id) : undefined}
        aria-label={lift ? `Open ${lift.name} history` : undefined}
        style={{ textAlign: 'center' }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: 'var(--text)',
          }}
        >
          {lift?.name ?? '…'}
        </h2>
      </PressScale>

      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-dim)', marginTop: -10 }}>
        {setsDone ? 'All sets done' : `Set ${currentSet} of ${exercise.plannedSets}`}
        {(exercise.loadText || exercise.repsText) && (
          <span>
            {' '}· plan {exercise.loadText ?? formatWeight(exercise.plannedLoad, units)} ×{' '}
            {exercise.repsText ?? exercise.plannedReps}
          </span>
        )}
        {exercise.remarks.length > 0 && (
          <span style={{ color: 'var(--text-faint)' }}> · {exercise.remarks.join(' · ')}</span>
        )}
      </div>

      {/* weight stepper */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <StepRound sign="−" onClick={() => { haptics.medium(); sound.tick(); setWeight((w) => Math.max(0, Math.round((w - WEIGHT_STEP_KG) * 100) / 100)) }} ariaLabel="Decrease weight" />
        <PressScale
          onClick={() => openPlateCalc(weight)}
          aria-label={`Show plates for ${formatWeight(weight, units)}`}
          style={{ textAlign: 'center', minWidth: 150 }}
        >
          <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)' }}>
            <RollingNumber value={units === 'kg' ? weight : kgToLbs(weight)} decimals={weight % 1 !== 0 || units === 'lbs' ? 1 : 0} />
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {units}
          </div>
        </PressScale>
        <StepRound sign="+" onClick={() => { haptics.medium(); sound.tick(); setWeight((w) => Math.round((w + WEIGHT_STEP_KG) * 100) / 100) }} ariaLabel="Increase weight" />
      </div>

      {/* reps stepper */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <StepRound sign="−" onClick={() => { haptics.medium(); sound.tick(); setReps((r) => Math.max(1, r - 1)) }} ariaLabel="Decrease reps" />
        <div style={{ textAlign: 'center', minWidth: 110 }}>
          <div style={{ fontSize: 34, fontWeight: 800, color: 'var(--text)' }}>
            <RollingNumber value={reps} />
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            reps
          </div>
        </div>
        <StepRound sign="+" onClick={() => { haptics.medium(); sound.tick(); setReps((r) => r + 1) }} ariaLabel="Increase reps" />
      </div>

      {lastLine && (
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-dim)' }}>{lastLine}</div>
      )}

      {/* giant check */}
      <div style={{ position: 'relative', marginTop: 4 }}>
        <PressScale
          onClick={() => void handleLog()}
          aria-label="Log set"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 84,
            height: 84,
            borderRadius: '50%',
            background: 'var(--accent)',
            boxShadow: '0 8px 28px var(--accent-soft)',
          }}
        >
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 12.5l5.5 5.5L20 7" />
          </svg>
        </PressScale>

        <AnimatePresence>
          {showPR && active && (
            <>
              <div style={{ position: 'absolute', left: '50%', top: '50%', zIndex: 5 }}>
                <Confetti onDone={() => setShowPR(false)} />
              </div>
              <motion.div
                initial={{ scale: 0, rotate: -8 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 18 }}
                style={{
                  position: 'absolute',
                  top: -14,
                  left: '50%',
                  translateX: '-50%',
                  zIndex: 6,
                  padding: '4px 12px',
                  borderRadius: 999,
                  background: 'var(--gold)',
                  color: 'var(--on-gold)',
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  whiteSpace: 'nowrap',
                }}
              >
                NEW PR
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* completed sets this session */}
      {ownSets && ownSets.length > 0 && (
        <div style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ownSets.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 14px',
                borderRadius: 12,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--text-dim)',
              }}
            >
              <span style={{ color: 'var(--text-faint)' }}>Set {i + 1}</span>
              <span style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                {formatWeight(s.weight, units)} × {s.reps}
              </span>
            </motion.div>
          ))}
        </div>
      )}

      {isLast && setsDone && (
        <PressScale
          onClick={onFinish}
          aria-label="Finish workout"
          style={{
            marginTop: 4,
            padding: '14px 38px',
            borderRadius: 16,
            background: 'var(--success)',
            color: 'var(--on-success)',
            fontSize: 16,
            fontWeight: 800,
          }}
        >
          Finish workout
        </PressScale>
      )}
    </div>
  )
}
