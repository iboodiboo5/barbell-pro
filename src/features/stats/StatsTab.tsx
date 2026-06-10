import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import { repo } from '../../data/repo'
import { kgToLbs } from '../../lib/plateMath'
import { Card } from '../../ui/Card'
import { LineChart } from '../../ui/LineChart'
import { weeklyConsistency, mondayOf } from './consistency'
import { ConsistencyGrid } from './ConsistencyGrid'
import { BodyWeightCard } from './BodyWeightCard'
import { DotsCard } from './DotsCard'

function localIso(ts: number): string {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
    >
      <Card>
        <div style={{ margin: '0 2px 14px', fontSize: 12, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
          {title}
        </div>
        {children}
      </Card>
    </motion.div>
  )
}

export function StatsTab() {
  const settings = useLiveQuery(() => repo.getSettings(), [])

  const logs = useLiveQuery(() => db.setLogs.toArray(), [])

  if (!settings || !logs) return null

  const units = settings.units
  const today = localIso(Date.now())

  // Distinct calendar dates with ≥1 set = sessions.
  const sessionDates = [...new Set(logs.map((s) => localIso(s.completedAt)))]
  const { weeks, currentStreak } = weeklyConsistency(
    sessionDates,
    settings.consistencyStartDate,
    settings.consistencyTargetPerWeek,
    today,
  )

  // Weekly volume: Σ weight × reps of working sets, grouped by Monday.
  const volumeByWeek = new Map<string, number>()
  for (const s of logs) {
    if (s.isWarmup) continue
    const ws = mondayOf(localIso(s.completedAt))
    volumeByWeek.set(ws, (volumeByWeek.get(ws) ?? 0) + s.weight * s.reps)
  }
  const volumePoints = [...volumeByWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ws, volKg]) => ({
      x: new Date(`${ws}T00:00`).getTime(),
      y: Math.round(units === 'kg' ? volKg : kgToLbs(volKg)),
      label: `wk ${new Date(`${ws}T00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`,
    }))

  return (
    <div style={{ paddingTop: 8 }}>
      <header style={{ padding: '8px 20px 14px' }}>
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em' }}>Stats</h1>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '0 16px' }}>
        <Section title="Consistency">
          {sessionDates.length === 0 ? (
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-dim)' }}>
              Log a workout to start your streak.
            </div>
          ) : (
            <ConsistencyGrid
              weeks={weeks}
              streak={currentStreak}
              targetPerWeek={settings.consistencyTargetPerWeek}
            />
          )}
        </Section>

        <Section title={`Weekly volume (${units})`}>
          {volumePoints.length === 0 ? (
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-dim)' }}>
              Volume shows up once you log sets.
            </div>
          ) : (
            <LineChart
              points={volumePoints}
              height={160}
              formatY={(n) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n))}
            />
          )}
        </Section>

        <Section title="Bodyweight">
          <BodyWeightCard units={units} />
        </Section>

        <Section title="DOTS score">
          <DotsCard sex={settings.sex} units={units} />
        </Section>
      </div>
    </div>
  )
}
