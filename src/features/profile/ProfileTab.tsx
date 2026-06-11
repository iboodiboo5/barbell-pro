import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import type { SetLog } from '../../data/db'
import { repo } from '../../data/repo'
import { computePRs } from '../../lib/prMath'
import { rankLifts } from '../../lib/liftRank'
import { useNavStore } from '../../navStore'
import { Card } from '../../ui/Card'
import { PressScale } from '../../ui/PressScale'
import { haptics } from '../../ui/haptics'
import { weeklyConsistency } from '../stats/consistency'
import { ConsistencyGrid } from '../stats/ConsistencyGrid'
import { GraphCard, type StatData } from '../stats/GraphCard'
import { METRICS, sanitizeStatCards, type MetricId } from '../stats/metrics'
import { LiftList } from '../lifts/LiftList'

function localIso(ts: number): string {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function Section({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
    >
      <Card>{children}</Card>
    </motion.div>
  )
}

interface PillDrag {
  metric: MetricId
  fromCard: number
  w: number
  h: number
  x: number
  y: number
}

/**
 * Profile tab: consistency, two metric graph cards (pills drag between them),
 * then the ranked lift list with the scroll-pop reveal.
 */
export function ProfileTab() {
  const openLift = useNavStore((s) => s.openLift)
  const openSettings = useNavStore((s) => s.openSettings)
  const liveDayId = useNavStore((s) => s.liveDayId)
  const [query, setQuery] = useState('')

  const settings = useLiveQuery(() => repo.getSettings(), [])

  const data = useLiveQuery(async () => {
    const [lifts, logs, exercises, weeks, bodyWeights] = await Promise.all([
      db.lifts.toArray(),
      db.setLogs.toArray(),
      db.exercises.toArray(),
      db.weeks.orderBy('order').toArray(),
      db.bodyWeights.toArray(),
    ])
    const latestWeek = weeks[weeks.length - 1]
    const days = latestWeek
      ? await db.days.where('weekId').equals(latestWeek.id).sortBy('order')
      : []
    return { lifts, logs, exercises, days, bodyWeights }
  }, [])

  // ── card layout (persisted) + active metric per card (session) ──────────
  const [cards, setCards] = useState<MetricId[][]>(sanitizeStatCards(undefined))
  useEffect(() => {
    if (settings) setCards(sanitizeStatCards(settings.statCards))
  }, [settings])
  const [activeByCard, setActiveByCard] = useState<(MetricId | null)[]>([null, null])

  // ── pill drag layer ──────────────────────────────────────────────────────
  const railRefs = useRef<(HTMLDivElement | null)[]>([null, null])
  const [drag, setDrag] = useState<PillDrag | null>(null)
  const [hoverCard, setHoverCard] = useState<number | null>(null)
  const cardsRef = useRef(cards)
  cardsRef.current = cards

  const railHit = (x: number, y: number): number | null => {
    for (let i = 0; i < 2; i++) {
      const rect = railRefs.current[i]?.getBoundingClientRect()
      if (!rect) continue
      if (x >= rect.left - 24 && x <= rect.right + 24 && y >= rect.top - 24 && y <= rect.bottom + 24) {
        return i
      }
    }
    return null
  }

  const startPillDrag = (metric: MetricId, fromCard: number, rect: DOMRect, point: { x: number; y: number }) => {
    haptics.medium()
    setDrag({ metric, fromCard, w: rect.width, h: rect.height, x: point.x, y: point.y })
    setHoverCard(fromCard)

    const onMove = (e: PointerEvent) => {
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d))
      setHoverCard(railHit(e.clientX, e.clientY))
    }
    const finish = (e: PointerEvent) => {
      cleanup()
      setDrag(null)
      setHoverCard(null)
      const target = railHit(e.clientX, e.clientY)
      if (target === null) return
      const current = cardsRef.current
      // drop index = how many other pill centers sit left of the pointer
      const rail = railRefs.current[target]
      let index = 0
      if (rail) {
        for (const el of rail.querySelectorAll<HTMLElement>('[data-pill]')) {
          if (el.dataset.pill === metric) continue
          const r = el.getBoundingClientRect()
          if (r.left + r.width / 2 < e.clientX) index++
        }
      }
      const next = current.map((card) => card.filter((m) => m !== metric))
      next[target].splice(index, 0, metric)
      if (target === fromCard && next[target].join() === current[fromCard].join()) return
      haptics.light()
      setCards(next)
      setActiveByCard((a) => {
        const out = [...a]
        out[target] = metric
        return out
      })
      void repo.updateSettings({ statCards: next })
    }
    const cancel = () => {
      cleanup()
      setDrag(null)
      setHoverCard(null)
    }
    const blockTouch = (e: TouchEvent) => e.preventDefault()
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('touchmove', blockTouch)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', cancel)
    // the gesture already started as a touch scroll candidate — kill scrolling
    window.addEventListener('touchmove', blockTouch, { passive: false })
  }

  if (!settings || !data) return null

  const units = settings.units
  const today = localIso(Date.now())

  // ── consistency ──────────────────────────────────────────────────────────
  const sessionDates = [...new Set(data.logs.map((s) => localIso(s.completedAt)))]
  const { weeks: consistencyWeeks, currentStreak } = weeklyConsistency(
    sessionDates,
    settings.consistencyStartDate,
    settings.consistencyTargetPerWeek,
    today,
  )

  // ── lift ranking context ─────────────────────────────────────────────────
  const exercisesByDay = new Map<string, typeof data.exercises>()
  for (const ex of data.exercises) {
    const list = exercisesByDay.get(ex.dayId) ?? []
    list.push(ex)
    exercisesByDay.set(ex.dayId, list)
  }
  const loggedExerciseIds = new Set(data.logs.map((s) => s.exerciseId))
  // today's workout = the live session's day, else the startable day of the
  // latest week (today's date, else first day with unlogged planned work)
  let todayDayId = liveDayId
  if (!todayDayId) {
    todayDayId = data.days.find((d) => d.date === today)?.id ?? null
    if (!todayDayId) {
      for (const day of data.days) {
        const exs = exercisesByDay.get(day.id) ?? []
        if (exs.length > 0 && exs.some((ex) => !loggedExerciseIds.has(ex.id))) {
          todayDayId = day.id
          break
        }
      }
    }
    if (!todayDayId) todayDayId = data.days[0]?.id ?? null
  }
  const todayLiftIds = new Set(
    (todayDayId ? (exercisesByDay.get(todayDayId) ?? []) : []).map((ex) => ex.liftId),
  )
  const latestWeekLiftIds = new Set(
    data.days.flatMap((d) => (exercisesByDay.get(d.id) ?? []).map((ex) => ex.liftId)),
  )

  const logsByLift = new Map<string, SetLog[]>()
  for (const log of data.logs) {
    const list = logsByLift.get(log.liftId) ?? []
    list.push(log)
    logsByLift.set(log.liftId, list)
  }
  const programLiftIds = new Set(data.exercises.map((e) => e.liftId))
  const ranked = rankLifts(
    data.lifts
      .filter((l) => logsByLift.has(l.id) || programLiftIds.has(l.id))
      .map((l) => ({
        id: l.id,
        name: l.name,
        sessionDates: (logsByLift.get(l.id) ?? []).map((s) => s.completedAt),
      })),
    { now: Date.now(), todayLiftIds, latestWeekLiftIds },
  )
  const aliasesByLift = new Map(data.lifts.map((l) => [l.id, l.aliases]))

  const q = query.trim().toLowerCase()
  const listRows = ranked
    .filter(
      (r) =>
        q === '' ||
        r.name.toLowerCase().includes(q) ||
        (aliasesByLift.get(r.id) ?? []).some((a) => a.includes(q)),
    )
    .map((r) => ({
      id: r.id,
      name: r.name,
      est1RM: computePRs(logsByLift.get(r.id) ?? []).est1RM,
      lastDone: r.lastDone,
      isToday: r.isToday,
    }))

  const statData: StatData = {
    logs: data.logs,
    logsByLift,
    lifts: data.lifts,
    bodyWeights: data.bodyWeights,
  }
  const chipLifts = ranked.map((r) => ({ id: r.id, name: r.name }))

  const cardTitles = ['Progress', 'Trends']

  return (
    <div style={{ paddingTop: 8 }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 20px 14px',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em' }}>Profile</h1>
        <PressScale
          onClick={openSettings}
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
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '0 16px' }}>
        <Section>
          <div style={{ margin: '0 2px 14px', fontSize: 12, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
            Consistency
          </div>
          {sessionDates.length === 0 ? (
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-dim)' }}>
              Log a workout to start your streak.
            </div>
          ) : (
            <ConsistencyGrid
              weeks={consistencyWeeks}
              streak={currentStreak}
              targetPerWeek={settings.consistencyTargetPerWeek}
            />
          )}
        </Section>

        {cards.map((metricIds, i) => {
          const active =
            activeByCard[i] && metricIds.includes(activeByCard[i]!)
              ? activeByCard[i]!
              : (metricIds[0] ?? null)
          return (
            <Section key={i}>
              <div style={hoverCard === i && drag ? { outline: '2px solid var(--accent)', outlineOffset: 6, borderRadius: 12 } : undefined}>
                <GraphCard
                  cardIndex={i}
                  title={cardTitles[i]}
                  metricIds={metricIds}
                  active={active}
                  onSelect={(m) =>
                    setActiveByCard((a) => {
                      const out = [...a]
                      out[i] = m
                      return out
                    })
                  }
                  draggingId={drag?.metric ?? null}
                  onPillLongPress={startPillDrag}
                  registerRail={(idx, el) => {
                    railRefs.current[idx] = el
                  }}
                  data={statData}
                  rankedLifts={chipLifts}
                  units={units}
                  sex={settings.sex}
                />
              </div>
            </Section>
          )
        })}

        {/* ── lifts ── */}
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          style={{ margin: '10px 4px 0', fontSize: 12, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-faint)' }}
        >
          Lifts
        </motion.div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search lifts"
          aria-label="Search lifts"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '11px 16px',
            borderRadius: 14,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            fontSize: 15,
            fontWeight: 600,
            outline: 'none',
          }}
        />
        {listRows.length === 0 ? (
          <div style={{ padding: '32px 16px 48px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 15, fontWeight: 600 }}>
            {q === '' ? 'Lifts appear here once you log sets or plan exercises.' : 'No lifts match.'}
          </div>
        ) : (
          <div style={{ paddingBottom: 24 }}>
            <LiftList rows={listRows} units={units} onOpen={openLift} />
          </div>
        )}
      </div>

      {/* floating pill ghost while dragging */}
      {drag && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: drag.x - drag.w / 2,
            top: drag.y - drag.h / 2 - 6,
            width: drag.w,
            zIndex: 200,
            pointerEvents: 'none',
          }}
        >
          <motion.div
            initial={{ scale: 1 }}
            animate={{ scale: 1.12 }}
            transition={{ type: 'spring', stiffness: 500, damping: 24 }}
            style={{
              padding: '6px 0',
              borderRadius: 9,
              background: 'var(--accent)',
              color: 'var(--text)',
              fontSize: 12,
              fontWeight: 700,
              textAlign: 'center',
              boxShadow: '0 10px 28px rgba(0, 0, 0, .55)',
            }}
          >
            {METRICS[drag.metric].label}
          </motion.div>
        </div>
      )}
    </div>
  )
}
