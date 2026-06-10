import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import type { Week } from '../../data/db'
import { repo } from '../../data/repo'
import { haptics } from '../../ui/haptics'
import { sound } from '../../ui/sound'
import { useLongPress } from './useLongPress'
import { ConfirmSheet } from './ConfirmSheet'

interface WeekPillsProps {
  weeks: Week[]
  selectedId: string
  onSelect: (id: string) => void
}

interface WeekPillProps {
  week: Week
  active: boolean
  armed: boolean
  onTap: () => void
  onArm: () => void
  onConfirmRequest: () => void
  onDuplicate: () => void
}

function WeekPill({ week, active, armed, onTap, onArm, onConfirmRequest, onDuplicate }: WeekPillProps) {
  const longPress = useLongPress(() => {
    haptics.warning()
    onArm()
  })

  // The pill is a non-interactive wrapper: the select <button> and the
  // duplicate <button> are siblings, never nested (invalid + confusing a11y).
  return (
    <div
      data-armed-pill={armed ? 'true' : undefined}
      style={{
        position: 'relative',
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        height: 38,
        paddingRight: active && !armed ? 10 : 0,
        borderRadius: 999,
        border: '1px solid',
        borderColor: armed ? 'var(--danger)' : active ? 'transparent' : 'var(--border-strong)',
        background: armed ? 'var(--danger)' : 'transparent',
        color: armed || active ? 'var(--text)' : 'var(--text-dim)',
        WebkitTouchCallout: 'none',
        touchAction: 'pan-x pan-y',
        transition: 'color .15s, border-color .15s',
      }}
    >
      {/* Springy accent indicator that travels between pills. */}
      {active && !armed && (
        <motion.span
          layoutId="week-pill"
          transition={{ type: 'spring', stiffness: 500, damping: 38 }}
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 999,
            background: 'var(--accent)',
            boxShadow: '0 2px 16px var(--accent-soft)',
          }}
        />
      )}
      <motion.button
        {...longPress}
        onClick={armed ? onConfirmRequest : onTap}
        whileTap={{ scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 600, damping: 30 }}
        aria-label={armed ? `Delete ${week.label}` : week.label}
        aria-pressed={active}
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'inline-flex',
          alignItems: 'center',
          height: '100%',
          padding: active && !armed ? '0 8px 0 16px' : '0 16px',
          border: 'none',
          background: 'transparent',
          color: 'inherit',
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: '-0.01em',
          cursor: 'pointer',
          WebkitTouchCallout: 'none',
          touchAction: 'pan-x pan-y',
        }}
      >
        {armed ? 'Delete?' : week.label}
      </motion.button>
      {active && !armed && (
        <motion.button
          aria-label={`Duplicate ${week.label}`}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          whileTap={{ scale: 0.85 }}
          onClick={onDuplicate}
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            padding: 0,
            border: 'none',
            borderRadius: '50%',
            background: 'var(--overlay-light)',
            color: 'inherit',
            cursor: 'pointer',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="12" height="12" rx="2.5" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </motion.button>
      )}
    </div>
  )
}

export function WeekPills({ weeks, selectedId, onSelect }: WeekPillsProps) {
  const [armedId, setArmedId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Tapping anywhere outside the armed pill disarms it.
  useEffect(() => {
    if (!armedId) return
    const onDocPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null
      if (!target?.closest('[data-armed-pill="true"]')) setArmedId(null)
    }
    document.addEventListener('pointerdown', onDocPointerDown, true)
    return () => document.removeEventListener('pointerdown', onDocPointerDown, true)
  }, [armedId])

  const confirmingWeek = weeks.find((w) => w.id === confirmingId) ?? null

  return (
    <>
      <div
        ref={scrollRef}
        className="no-scrollbar"
        aria-label="Weeks"
        style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          padding: '4px 20px 12px',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {weeks.map((week) => (
          <WeekPill
            key={week.id}
            week={week}
            active={week.id === selectedId}
            armed={week.id === armedId}
            onTap={() => {
              haptics.light()
              setArmedId(null)
              onSelect(week.id)
            }}
            onArm={() => setArmedId(week.id)}
            onConfirmRequest={() => {
              setConfirmingId(week.id)
              setArmedId(null)
            }}
            onDuplicate={() => {
              void repo.duplicateWeek(week.id).then((copy) => {
                haptics.success()
                sound.tick()
                onSelect(copy.id)
              })
            }}
          />
        ))}

        <motion.button
          onClick={() => {
            haptics.medium()
            void repo.addWeek().then((week) => onSelect(week.id))
          }}
          whileTap={{ scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 600, damping: 30 }}
          aria-label="Add week"
          style={{
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 38,
            height: 38,
            borderRadius: 999,
            border: '1px dashed var(--border-strong)',
            background: 'transparent',
            color: 'var(--text-dim)',
            cursor: 'pointer',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </motion.button>
      </div>

      <ConfirmSheet
        open={confirmingId !== null}
        title={`Delete ${confirmingWeek?.label ?? 'week'}?`}
        message="All days, exercises and logged sets in this week will be removed. This can't be undone."
        confirmLabel="Delete week"
        onConfirm={() => {
          const id = confirmingId
          setConfirmingId(null)
          if (id) {
            haptics.warning()
            void repo.deleteWeek(id)
          }
        }}
        onClose={() => setConfirmingId(null)}
      />
    </>
  )
}
