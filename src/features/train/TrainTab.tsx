import { useEffect, useState, type CSSProperties } from 'react'
import { motion, type Variants } from 'motion/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Day } from '../../data/db'
import { repo } from '../../data/repo'
import { useNavStore } from '../../navStore'
import { LAST_CALC_WEIGHT_KEY } from '../plate-calc/PlateCalcSheet'
import { Button } from '../../ui/Button'
import { PressScale } from '../../ui/PressScale'
import { haptics } from '../../ui/haptics'
import { WeekPills } from './WeekPills'
import { DayCard } from './DayCard'

const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 420, damping: 34 } },
}

/** Today's date as a local YYYY-MM-DD string. */
function todayIso(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const addDayInputStyle: CSSProperties = {
  flex: 1,
  height: 44,
  padding: '0 14px',
  borderRadius: 12,
  border: '1px solid var(--border-strong)',
  background: 'var(--surface-2)',
  color: 'var(--text)',
  fontSize: 15,
  outline: 'none',
}

/** Dashed ghost card that expands into a name input for adding a day. */
function AddDayCard({ weekId, nextIndex }: { weekId: string; nextIndex: number }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')

  const submit = () => {
    const resolved = name.trim() || `Day ${nextIndex}`
    haptics.success()
    void repo.addDay(weekId, resolved)
    setName('')
    setEditing(false)
  }

  if (!editing) {
    return (
      <PressScale
        onClick={() => setEditing(true)}
        aria-label="Add day"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          height: 64,
          borderRadius: 'var(--radius-card)',
          border: '1px dashed var(--border-strong)',
          color: 'var(--text-dim)',
          fontSize: 15,
          fontWeight: 600,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add day
      </PressScale>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 36 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: 10,
        borderRadius: 'var(--radius-card)',
        border: '1px dashed var(--border-strong)',
      }}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') setEditing(false)
        }}
        placeholder={`Day ${nextIndex}`}
        aria-label="Day name"
        autoComplete="off"
        style={addDayInputStyle}
      />
      <Button onClick={submit} style={{ minHeight: 44, padding: '0 18px', borderRadius: 12 }}>
        Add
      </Button>
    </motion.div>
  )
}

/** Inline barbell illustration for the no-weeks empty state. */
function BarbellGraphic() {
  return (
    <svg width="180" height="72" viewBox="0 0 180 72" fill="none" aria-hidden="true">
      {/* bar */}
      <rect x="6" y="33" width="168" height="6" rx="3" fill="var(--border-strong)" />
      {/* sleeves */}
      <rect x="22" y="31" width="10" height="10" rx="3" fill="var(--text-faint)" />
      <rect x="148" y="31" width="10" height="10" rx="3" fill="var(--text-faint)" />
      {/* plates — accent, biggest inside */}
      <rect x="34" y="8" width="12" height="56" rx="5" fill="var(--accent)" opacity="0.9" />
      <rect x="48" y="16" width="10" height="40" rx="4" fill="var(--accent)" opacity="0.55" />
      <rect x="60" y="22" width="8" height="28" rx="4" fill="var(--accent)" opacity="0.3" />
      <rect x="134" y="8" width="12" height="56" rx="5" fill="var(--accent)" opacity="0.9" />
      <rect x="122" y="16" width="10" height="40" rx="4" fill="var(--accent)" opacity="0.55" />
      <rect x="112" y="22" width="8" height="28" rx="4" fill="var(--accent)" opacity="0.3" />
    </svg>
  )
}

export function TrainTab() {
  const weeks = useLiveQuery(() => db.weeks.orderBy('order').toArray(), [])
  const settings = useLiveQuery(() => repo.getSettings(), [])
  const openPlateCalc = useNavStore((s) => s.openPlateCalc)

  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null)
  // Default to the most recent week; fall back gracefully if the selected one
  // was deleted.
  const selectedWeek =
    weeks?.find((w) => w.id === selectedWeekId) ?? weeks?.[weeks.length - 1] ?? null

  const selectedWeekDbId = selectedWeek?.id
  const days = useLiveQuery<Day[]>(
    async () =>
      selectedWeekDbId ? db.days.where('weekId').equals(selectedWeekDbId).sortBy('order') : [],
    [selectedWeekDbId],
  )

  const today = todayIso()

  // The single day that shows the Start Workout button: the day dated today,
  // else the first incomplete day (has at least one exercise with zero logged
  // sets), else the first day. Distinct from the TODAY badge, which only ever
  // appears on a day literally dated today.
  const startableDayId = useLiveQuery(async () => {
    if (!days || days.length === 0) return undefined
    const todayDay = days.find((d) => d.date === today)
    if (todayDay) return todayDay.id
    for (const day of days) {
      const exercises = await db.exercises.where('dayId').equals(day.id).toArray()
      if (exercises.length === 0) continue
      for (const exercise of exercises) {
        const logged = await db.setLogs.where('exerciseId').equals(exercise.id).count()
        if (logged === 0) return day.id
      }
    }
    return days[0].id
  }, [days, today])

  // One open swipe row across every day card, so a tap on any other row can
  // only dismiss it (never fall through to that row's edit sheet).
  const [swipeOpenId, setSwipeOpenId] = useState<string | null>(null)
  useEffect(() => {
    if (swipeOpenId === null) return
    const onDocPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null
      // Taps on exercise rows are handled by the rows themselves (close-only).
      if (!target?.closest('[data-exercise-row]')) setSwipeOpenId(null)
    }
    document.addEventListener('pointerdown', onDocPointerDown, true)
    return () => document.removeEventListener('pointerdown', onDocPointerDown, true)
  }, [swipeOpenId])

  if (!weeks || !settings) return null

  const units = settings.units

  return (
    <div style={{ paddingTop: 8 }}>
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 20px 14px',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em' }}>Train</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <PressScale
          onClick={() => {
            const last = Number(localStorage.getItem(LAST_CALC_WEIGHT_KEY))
            openPlateCalc(Number.isFinite(last) && last > 0 ? last : 60)
          }}
          aria-label="Plate calculator"
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
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6.5 12h11" />
            <path d="M6.5 7.5v9M17.5 7.5v9" />
            <path d="M3.5 9.5v5M20.5 9.5v5" />
            <path d="M2 12h1.5M20.5 12h1.5" />
          </svg>
        </PressScale>
        {/* TODO(Task 10): open the Settings sheet from here. */}
        <PressScale
          onClick={() => {}}
          aria-label="Settings"
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
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </PressScale>
        </div>
      </header>

      {weeks.length === 0 ? (
        /* ── Empty state: no weeks ─────────────────────────────────── */
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            padding: '64px 32px',
            textAlign: 'center',
          }}
        >
          <BarbellGraphic />
          <p style={{ margin: '20px 0 0', fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em' }}>
            Plan your training
          </p>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.5 }}>
            Weeks hold your days, days hold your lifts.
          </p>
          <Button
            onClick={() => {
              haptics.medium()
              void repo.addWeek().then((w) => setSelectedWeekId(w.id))
            }}
            style={{ marginTop: 16 }}
          >
            Add your first week
          </Button>
        </motion.div>
      ) : (
        <>
          <WeekPills
            weeks={weeks}
            selectedId={selectedWeek?.id ?? ''}
            onSelect={setSelectedWeekId}
          />

          {selectedWeek && days && (
            <motion.div
              key={selectedWeek.id}
              variants={listVariants}
              initial="hidden"
              animate="show"
              style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 20px 24px' }}
            >
              {days.length === 0 && (
                <motion.p
                  variants={itemVariants}
                  style={{ margin: '8px 4px', fontSize: 15, color: 'var(--text-dim)', textAlign: 'center' }}
                >
                  Add a day to start planning.
                </motion.p>
              )}
              {days.map((day) => (
                <motion.div key={day.id} variants={itemVariants}>
                  <DayCard
                    day={day}
                    isToday={day.date === today}
                    isStartable={day.id === startableDayId}
                    units={units}
                    swipeOpenId={swipeOpenId}
                    onSwipeOpenChange={setSwipeOpenId}
                  />
                </motion.div>
              ))}
              <motion.div variants={itemVariants}>
                <AddDayCard weekId={selectedWeek.id} nextIndex={days.length + 1} />
              </motion.div>
            </motion.div>
          )}
        </>
      )}
    </div>
  )
}
