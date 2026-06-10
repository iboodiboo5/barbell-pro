import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import type { SetLog } from '../../data/db'
import { computePRs, dotsScore } from '../../lib/prMath'
import { formatWeight } from '../../lib/plateMath'
import { normalizeLiftName } from '../../data/liftCatalog'
import { RollingNumber } from '../../ui/RollingNumber'

const BIG_THREE = ['squat', 'bench', 'deadlift'] as const

export function DotsCard({ sex, units }: { sex: 'male' | 'female'; units: 'kg' | 'lbs' }) {
  const data = useLiveQuery(async () => {
    const [lifts, logs, bodyWeights] = await Promise.all([
      db.lifts.toArray(),
      db.setLogs.toArray(),
      db.bodyWeights.toArray(),
    ])
    const logsByLift = new Map<string, SetLog[]>()
    for (const log of logs) {
      const list = logsByLift.get(log.liftId) ?? []
      list.push(log)
      logsByLift.set(log.liftId, list)
    }
    // Best est-1RM across all lifts whose name contains the keyword.
    const bestFor = (keyword: string): number | null => {
      let best: number | null = null
      for (const lift of lifts) {
        if (!normalizeLiftName(lift.name).includes(keyword)) continue
        const est = computePRs(logsByLift.get(lift.id) ?? []).est1RM
        if (est !== null && (best === null || est > best)) best = est
      }
      return best
    }
    const [squat, bench, deadlift] = BIG_THREE.map(bestFor)
    const sorted = bodyWeights.sort((a, b) => a.date.localeCompare(b.date))
    const latestBw = sorted[sorted.length - 1]
    return { squat, bench, deadlift, bodyWeightKg: latestBw?.weightKg ?? null }
  }, [])

  if (!data) return null

  const { squat, bench, deadlift, bodyWeightKg } = data
  const missing: string[] = []
  if (squat === null) missing.push('squat')
  if (bench === null) missing.push('bench')
  if (deadlift === null) missing.push('deadlift')
  if (bodyWeightKg === null) missing.push('bodyweight')

  if (missing.length > 0) {
    return (
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-dim)', lineHeight: 1.5 }}>
        Log {missing.join(', ')} to unlock your DOTS score.
      </div>
    )
  }

  const totalKg = squat! + bench! + deadlift!
  const score = Math.round(dotsScore(totalKg, bodyWeightKg!, sex) * 10) / 10

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--accent)' }}>
          <RollingNumber value={score} decimals={1} />
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-faint)' }}>
          est. total {formatWeight(Math.round(totalKg * 10) / 10, units)} @ {formatWeight(bodyWeightKg!, units)}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', textAlign: 'right' }}>
        <span>S {formatWeight(Math.round(squat! * 10) / 10, units)}</span>
        <span>B {formatWeight(Math.round(bench! * 10) / 10, units)}</span>
        <span>D {formatWeight(Math.round(deadlift! * 10) / 10, units)}</span>
      </div>
    </div>
  )
}
