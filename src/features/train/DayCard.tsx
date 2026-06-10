import { useEffect, useRef, useState } from 'react'
import { Reorder } from 'motion/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Day, type Exercise } from '../../data/db'
import { repo } from '../../data/repo'
import { useNavStore } from '../../navStore'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { PressScale } from '../../ui/PressScale'
import { haptics } from '../../ui/haptics'
import { useLongPress } from './useLongPress'
import { ConfirmSheet } from './ConfirmSheet'
import { ExerciseRow } from './ExerciseRow'
import { ExerciseForm } from './ExerciseForm'

interface DayCardProps {
  day: Day
  isToday: boolean
  units: 'kg' | 'lbs'
}

function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

export function DayCard({ day, isToday, units }: DayCardProps) {
  const startLive = useNavStore((s) => s.startLive)
  const exercises = useLiveQuery(
    () => db.exercises.where('dayId').equals(day.id).sortBy('order'),
    [day.id],
  )

  // Local copy for Reorder.Group: tracks the db unless a reorder drag is live.
  const [items, setItems] = useState<Exercise[]>([])
  const itemsRef = useRef<Exercise[]>([])
  const reordering = useRef(false)
  useEffect(() => {
    if (exercises && !reordering.current) {
      setItems(exercises)
      itemsRef.current = exercises
    }
  }, [exercises])

  const [swipeOpenId, setSwipeOpenId] = useState<string | null>(null)
  const [form, setForm] = useState<{ open: boolean; exercise: Exercise | null }>({
    open: false,
    exercise: null,
  })
  const [armedDelete, setArmedDelete] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const headerLongPress = useLongPress(() => {
    haptics.warning()
    setArmedDelete(true)
  })

  // Tap anywhere outside the armed header → disarm. Same for an open swipe row.
  useEffect(() => {
    if (!armedDelete && swipeOpenId === null) return
    const onDocPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null
      if (armedDelete && !target?.closest(`[data-armed-day="${day.id}"]`)) setArmedDelete(false)
      if (swipeOpenId !== null && !target?.closest('[data-swipe-open="true"]')) setSwipeOpenId(null)
    }
    document.addEventListener('pointerdown', onDocPointerDown, true)
    return () => document.removeEventListener('pointerdown', onDocPointerDown, true)
  }, [armedDelete, swipeOpenId, day.id])

  return (
    <Card glow={isToday} style={{ padding: 18 }}>
      {/* Header — long-press arms inline delete. */}
      <div
        {...headerLongPress}
        data-armed-day={armedDelete ? day.id : undefined}
        onClick={armedDelete ? () => setConfirmingDelete(true) : undefined}
        role={armedDelete ? 'button' : undefined}
        aria-label={armedDelete ? `Delete ${day.name}` : undefined}
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: items.length > 0 ? 14 : 10,
          WebkitTouchCallout: 'none',
          cursor: armedDelete ? 'pointer' : 'default',
        }}
      >
        <span
          style={{
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: armedDelete ? 'var(--danger)' : 'var(--text)',
            transition: 'color .15s',
          }}
        >
          {armedDelete ? 'Delete?' : day.name}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {isToday && !armedDelete && (
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 6,
                background: 'var(--accent-soft)',
                color: 'var(--accent)',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Today
            </span>
          )}
          {day.date && !armedDelete && (
            <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>{formatDate(day.date)}</span>
          )}
        </span>
      </div>

      {/* Exercises */}
      {items.length > 0 ? (
        <Reorder.Group
          axis="y"
          as="div"
          values={items}
          onReorder={(next) => {
            setItems(next)
            itemsRef.current = next
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {items.map((exercise) => (
            <ExerciseRow
              key={exercise.id}
              exercise={exercise}
              units={units}
              swipeOpen={swipeOpenId === exercise.id}
              onSwipeOpenChange={(open) => setSwipeOpenId(open ? exercise.id : null)}
              onEdit={() => setForm({ open: true, exercise })}
              onReorderStart={() => {
                reordering.current = true
              }}
              onReorderEnd={() => {
                reordering.current = false
                void repo.reorderExercises(
                  day.id,
                  itemsRef.current.map((e) => e.id),
                )
              }}
            />
          ))}
        </Reorder.Group>
      ) : (
        exercises && (
          <p style={{ margin: '4px 0 10px', fontSize: 14, color: 'var(--text-faint)' }}>
            No exercises yet.
          </p>
        )
      )}

      {/* + Exercise */}
      <PressScale
        onClick={() => setForm({ open: true, exercise: null })}
        aria-label={`Add exercise to ${day.name}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          height: 44,
          marginTop: items.length > 0 ? 10 : 0,
          borderRadius: 12,
          border: '1px dashed var(--border-strong)',
          color: 'var(--text-dim)',
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Exercise
      </PressScale>

      {/* Start Workout — today's card only */}
      {isToday && (
        <Button
          fullWidth
          onClick={() => {
            haptics.medium()
            startLive(day.id)
          }}
          style={{ marginTop: 12, minHeight: 52, fontSize: 17, boxShadow: '0 4px 20px var(--accent-soft)' }}
        >
          Start Workout
        </Button>
      )}

      <ExerciseForm
        open={form.open}
        onClose={() => setForm((f) => ({ ...f, open: false }))}
        dayId={day.id}
        units={units}
        exercise={form.exercise}
      />

      <ConfirmSheet
        open={confirmingDelete}
        title={`Delete ${day.name}?`}
        message="All exercises and logged sets in this day will be removed. This can't be undone."
        confirmLabel="Delete day"
        onConfirm={() => {
          setConfirmingDelete(false)
          setArmedDelete(false)
          haptics.warning()
          void repo.deleteDay(day.id)
        }}
        onClose={() => {
          setConfirmingDelete(false)
          setArmedDelete(false)
        }}
      />
    </Card>
  )
}
