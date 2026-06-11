import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { animate, motion, useMotionValue } from 'motion/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import { useNavStore } from '../../navStore'
import { PressScale } from '../../ui/PressScale'
import { haptics } from '../../ui/haptics'
import { ConfirmSheet } from '../train/ConfirmSheet'
import { useLiveStore } from './liveStore'
import { SetLogger } from './SetLogger'
import { RestTimer } from './RestTimer'
import { SessionSummary } from './SessionSummary'

const PAGE_SPRING = { type: 'spring', stiffness: 400, damping: 40 } as const

/**
 * Full-screen live-workout layer. Mounted by App when navStore.liveActive;
 * starts a session for liveDayId unless one is already active (resume).
 */
export function LiveWorkout() {
  const liveDayId = useNavStore((s) => s.liveDayId)
  const endLive = useNavStore((s) => s.endLive)

  const session = useLiveStore((s) => s.session)
  const exercises = useLiveStore((s) => s.exercises)
  const currentIndex = useLiveStore((s) => s.currentIndex)
  const setCounts = useLiveStore((s) => s.setCounts)
  const summary = useLiveStore((s) => s.summary)
  const startSession = useLiveStore((s) => s.startSession)
  const finishSession = useLiveStore((s) => s.finishSession)
  const abandonSession = useLiveStore((s) => s.abandonSession)
  const setCurrentIndex = useLiveStore((s) => s.setCurrentIndex)
  const reset = useLiveStore((s) => s.reset)

  const [confirmAbandon, setConfirmAbandon] = useState(false)

  const day = useLiveQuery(
    () => (session ? db.days.get(session.dayId) : undefined),
    [session?.dayId],
  )

  // Start a fresh session unless one is already loaded (resume path).
  useEffect(() => {
    if (!useLiveStore.getState().session && liveDayId) {
      void startSession(liveDayId)
    }
  }, [liveDayId, startSession])

  // ── pager ────────────────────────────────────────────────────────────────
  const viewportRef = useRef<HTMLDivElement>(null)
  const [pageWidth, setPageWidth] = useState(0)
  const x = useMotionValue(0)

  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const update = () => setPageWidth(el.offsetWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (pageWidth === 0) return
    const controls = animate(x, -currentIndex * pageWidth, PAGE_SPRING)
    return () => controls.stop()
  }, [currentIndex, pageWidth, x])

  const settle = (offsetX: number, velocityX: number) => {
    let next = currentIndex
    if (offsetX < -pageWidth * 0.25 || velocityX < -500) next = currentIndex + 1
    else if (offsetX > pageWidth * 0.25 || velocityX > 500) next = currentIndex - 1
    next = Math.max(0, Math.min(exercises.length - 1, next))
    if (next !== currentIndex) {
      haptics.light()
      setCurrentIndex(next) // effect above springs x to the new page
    } else {
      animate(x, -currentIndex * pageWidth, PAGE_SPRING) // settle back explicitly
    }
  }

  const handleFinish = async () => {
    haptics.success()
    await finishSession()
  }

  const handleDone = () => {
    reset()
    endLive()
  }

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 320, damping: 34 }}
      style={{
        position: 'fixed',
        inset: 0,
        // Above the TabBar (100) — a live session is full-screen and must not
        // let the bar bury the summary's Done button; below sheets (200).
        zIndex: 120,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
        paddingTop: 'var(--safe-top)',
      }}
    >
      {/* header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 16px 4px',
        }}
      >
        <PressScale
          onClick={() => setConfirmAbandon(true)}
          aria-label="End workout"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--text-dim)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </PressScale>

        <div style={{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
          {day?.name ?? ''}
        </div>

        <PressScale
          onClick={() => void handleFinish()}
          aria-label="Finish workout"
          style={{
            padding: '8px 14px',
            borderRadius: 12,
            background: 'var(--accent-soft)',
            color: 'var(--accent)',
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          Finish
        </PressScale>
      </div>

      {/* segmented progress: one segment per exercise, filled by sets done */}
      <div style={{ display: 'flex', gap: 4, padding: '10px 16px 6px' }} aria-hidden="true">
        {exercises.map((ex, i) => {
          const done = Math.min(setCounts[ex.id] ?? 0, ex.plannedSets)
          const fraction = ex.plannedSets > 0 ? done / ex.plannedSets : 0
          return (
            <div
              key={ex.id}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 999,
                background: 'var(--border)',
                overflow: 'hidden',
                outline: i === currentIndex ? '1px solid var(--accent)' : 'none',
                outlineOffset: 1,
              }}
            >
              <motion.div
                initial={false}
                animate={{ width: `${fraction * 100}%` }}
                transition={{ type: 'spring', stiffness: 220, damping: 28 }}
                style={{ height: '100%', background: 'var(--accent)', borderRadius: 999 }}
              />
            </div>
          )
        })}
      </div>

      {/* swipeable exercise pager */}
      <div ref={viewportRef} style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {exercises.length === 0 ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-dim)',
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            No exercises in this day
          </div>
        ) : (
          <motion.div
            drag={exercises.length > 1 ? 'x' : false}
            dragConstraints={{ left: -(exercises.length - 1) * pageWidth, right: 0 }}
            dragElastic={0.12}
            dragMomentum={false}
            onDragEnd={(_, info) => settle(info.offset.x, info.velocity.x)}
            style={{
              display: 'flex',
              height: '100%',
              width: `${exercises.length * 100}%`,
              x,
              touchAction: 'pan-y',
            }}
          >
            {exercises.map((ex, i) => (
              <div
                key={ex.id}
                style={{
                  width: pageWidth || '100%',
                  flexShrink: 0,
                  height: '100%',
                  overflowY: 'auto',
                  paddingBottom: 120, // room for the floating rest timer
                }}
              >
                <SetLogger
                  exercise={ex}
                  active={i === currentIndex}
                  isLast={i === exercises.length - 1}
                  onFinish={() => void handleFinish()}
                />
              </div>
            ))}
          </motion.div>
        )}

        <RestTimer />
      </div>

      {/* dots: position within the program */}
      {exercises.length > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 6,
            padding: '8px 0 calc(12px + var(--safe-bottom))',
          }}
          aria-label={`Exercise ${currentIndex + 1} of ${exercises.length}`}
        >
          {exercises.map((ex, i) => (
            <motion.div
              key={ex.id}
              initial={false}
              animate={{
                scale: i === currentIndex ? 1.25 : 1,
                backgroundColor: i === currentIndex ? 'var(--accent)' : 'var(--border-strong)',
              }}
              style={{ width: 7, height: 7, borderRadius: '50%' }}
            />
          ))}
        </div>
      )}

      {summary && <SessionSummary summary={summary} onDone={handleDone} />}

      <ConfirmSheet
        open={confirmAbandon}
        title="End workout?"
        message="Sets you already logged are kept. The session just won't get a summary."
        confirmLabel="End workout"
        onConfirm={() => {
          setConfirmAbandon(false)
          void abandonSession().then(endLive)
        }}
        onClose={() => setConfirmAbandon(false)}
      />
    </motion.div>
  )
}
