import { animate, motion, Reorder, useDragControls, useMotionValue, useTransform } from 'motion/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Exercise } from '../../data/db'
import { formatWeight } from '../../lib/plateMath'
import { useNavStore } from '../../navStore'
import { haptics } from '../../ui/haptics'
import { PressScale } from '../../ui/PressScale'

const SWIPE_REVEAL = 96 // px the row slides left to expose the delete button

interface ExerciseRowProps {
  exercise: Exercise
  units: 'kg' | 'lbs'
  swipeOpen: boolean
  /** True while any row's swipe (this one or a sibling) is open. */
  anySwipeOpen: boolean
  onSwipeOpenChange: (open: boolean) => void
  onEdit: () => void
  onDelete: () => void
  onReorderStart: () => void
  onReorderEnd: () => void
}

export function ExerciseRow({
  exercise,
  units,
  swipeOpen,
  anySwipeOpen,
  onSwipeOpenChange,
  onEdit,
  onDelete,
  onReorderStart,
  onReorderEnd,
}: ExerciseRowProps) {
  const dragControls = useDragControls()
  const openLift = useNavStore((s) => s.openLift)
  const openPlateCalc = useNavStore((s) => s.openPlateCalc)
  const lift = useLiveQuery(() => db.lifts.get(exercise.liftId), [exercise.liftId])

  const todayStr = new Date().toDateString()
  const completedCount = useLiveQuery(
    () =>
      db.setLogs
        .where('exerciseId')
        .equals(exercise.id)
        .filter((s) => !s.isWarmup && new Date(s.completedAt).toDateString() === todayStr)
        .count(),
    [exercise.id, todayStr],
  ) ?? 0

  // Tie the delete layer's visibility to the actual swipe offset so it never
  // peeks out from behind the row's rounded corners at rest.
  const x = useMotionValue(0)
  const deleteOpacity = useTransform(x, [-24, -4], [1, 0])

  return (
    <Reorder.Item
      value={exercise}
      as="div"
      dragListener={false}
      dragControls={dragControls}
      onDragStart={onReorderStart}
      onDragEnd={onReorderEnd}
      data-exercise-row=""
      data-swipe-open={swipeOpen ? 'true' : undefined}
      style={{ position: 'relative', overflow: 'hidden', borderRadius: 14 }}
    >
      {/* Delete action revealed behind the row by swiping left. */}
      <motion.div
        aria-hidden={!swipeOpen}
        style={{
          opacity: deleteOpacity,
          position: 'absolute',
          inset: 0,
          display: 'flex',
          justifyContent: 'flex-end',
          borderRadius: 14,
          overflow: 'hidden',
          // While hidden behind the row the control must be unreachable by
          // both pointer and keyboard (it's visually invisible).
          pointerEvents: swipeOpen ? 'auto' : 'none',
        }}
      >
        <PressScale
          onClick={onDelete}
          tabIndex={swipeOpen ? 0 : -1}
          aria-label={`Delete ${lift?.name ?? 'exercise'}`}
          style={{
            width: SWIPE_REVEAL - 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--danger)',
            color: 'var(--text)',
            borderRadius: 14,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 6h18" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
          </svg>
        </PressScale>
      </motion.div>

      {/* Swipeable row surface. */}
      <motion.div
        drag="x"
        dragConstraints={{ left: -SWIPE_REVEAL, right: 0 }}
        dragElastic={{ left: 0.12, right: 0 }}
        dragMomentum={false}
        animate={{ x: swipeOpen ? -SWIPE_REVEAL : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
        onDragEnd={(_, info) => {
          const next = swipeOpen ? info.offset.x < SWIPE_REVEAL / 3 : info.offset.x < -SWIPE_REVEAL / 2
          if (next !== swipeOpen) haptics.light()
          // With dragMomentum={false} Motion leaves x wherever the finger let
          // go, and the `animate` prop only re-runs when its target changes —
          // so an under-threshold release (state unchanged) would strand the
          // row mid-track. Always animate x to the resolved rest position.
          // (This file is the template for future swipe rows: keep this.)
          animate(x, next ? -SWIPE_REVEAL : 0, { type: 'spring', stiffness: 500, damping: 40 })
          onSwipeOpenChange(next)
        }}
        onClick={() => {
          // A tap on a displaced row (half-open or still settling), or while
          // any sibling row's swipe is open, dismisses swipes — it never opens
          // the edit sheet.
          if (swipeOpen || anySwipeOpen || Math.abs(x.get()) > 1) {
            onSwipeOpenChange(false)
            animate(x, 0, { type: 'spring', stiffness: 500, damping: 40 })
          } else {
            haptics.light()
            onEdit()
          }
        }}
        style={{
          x,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 6px 12px 14px',
          borderRadius: 14,
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          touchAction: 'pan-y',
          cursor: 'pointer',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (anySwipeOpen) {
                // An open swipe anywhere turns this tap into "dismiss".
                onSwipeOpenChange(false)
                return
              }
              haptics.light()
              openLift(exercise.liftId)
            }}
            aria-label={`Open ${lift?.name ?? 'lift'} history`}
            style={{
              display: 'block',
              maxWidth: '100%',
              padding: 0,
              border: 'none',
              background: 'none',
              textAlign: 'left',
              color: 'var(--text)',
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              cursor: 'pointer',
            }}
          >
            {lift?.name ?? '…'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
              <PressScale
                onClick={() => {
                  if (anySwipeOpen) {
                    // An open swipe anywhere turns this tap into "dismiss".
                    onSwipeOpenChange(false)
                    return
                  }
                  openPlateCalc(exercise.plannedLoad)
                }}
                aria-label={`Load ${exercise.loadText ?? formatWeight(exercise.plannedLoad, units)} — open plate calculator`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '3px 10px',
                  borderRadius: 8,
                  background: 'var(--accent-soft)',
                  color: 'var(--accent)',
                  fontSize: 13,
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '0.01em',
                }}
              >
                {exercise.loadText ?? formatWeight(exercise.plannedLoad, units)}
              </PressScale>
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-dim)', fontVariantNumeric: 'tabular-nums' }}>
              × {exercise.plannedSets} × {exercise.repsText ?? exercise.plannedReps}
            </span>
          </div>

          {/* Per-set completion dots */}
          {(() => {
            const total = exercise.plannedSets
            const filled = completedCount >= total ? total : completedCount
            const dots = Array.from({ length: total }, (_, i) => i < filled)
            return (
              <div
                aria-label={`${filled} of ${total} sets completed`}
                style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 7 }}
              >
                {dots.map((isDone, i) =>
                  isDone ? (
                    <motion.div
                      key={i}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: 'var(--accent)',
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <div
                      key={i}
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: 'transparent',
                        border: '1px solid var(--border-strong)',
                        flexShrink: 0,
                      }}
                    />
                  )
                )}
              </div>
            )
          })()}

          {exercise.remarks.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {exercise.remarks.map((remark, i) => (
                <span
                  key={`${remark}-${i}`}
                  style={{
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-faint)',
                    fontSize: 11,
                    fontWeight: 500,
                  }}
                >
                  {remark}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Reorder drag handle — the only place a vertical drag can start. */}
        <div
          onPointerDown={(e) => {
            e.stopPropagation()
            e.preventDefault()
            haptics.light()
            dragControls.start(e)
          }}
          onClick={(e) => e.stopPropagation()}
          role="button"
          aria-label={`Reorder ${lift?.name ?? 'exercise'}`}
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            alignSelf: 'stretch',
            color: 'var(--text-faint)',
            touchAction: 'none',
            cursor: 'grab',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </div>
      </motion.div>
    </Reorder.Item>
  )
}
