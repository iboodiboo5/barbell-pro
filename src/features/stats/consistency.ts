export interface WeekConsistency {
  /** Monday of the week, local YYYY-MM-DD. */
  weekStart: string
  sessions: number
  met: boolean
}

export interface ConsistencyResult {
  weeks: WeekConsistency[]
  /**
   * Consecutive met weeks ending at the current week. The in-progress current
   * week counts as met early once it hits the target, and never breaks the
   * streak while unfinished.
   */
  currentStreak: number
}

function parseLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toIso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Monday of the week containing the given local date. */
export function mondayOf(iso: string): string {
  const d = parseLocal(iso)
  const shift = (d.getDay() + 6) % 7 // Mon=0 … Sun=6
  d.setDate(d.getDate() - shift)
  return toIso(d)
}

export function weeklyConsistency(
  sessionDates: string[],
  startDate: string,
  targetPerWeek: number,
  today: string,
): ConsistencyResult {
  // A "session" is a calendar date with ≥1 logged set — dedupe dates first.
  const counts = new Map<string, number>()
  for (const date of new Set(sessionDates)) {
    const ws = mondayOf(date)
    counts.set(ws, (counts.get(ws) ?? 0) + 1)
  }

  const weeks: WeekConsistency[] = []
  const endMonday = mondayOf(today)
  const cursor = parseLocal(mondayOf(startDate))
  while (toIso(cursor) <= endMonday) {
    const weekStart = toIso(cursor)
    const sessions = counts.get(weekStart) ?? 0
    weeks.push({ weekStart, sessions, met: sessions >= targetPerWeek })
    cursor.setDate(cursor.getDate() + 7)
  }

  let currentStreak = 0
  let i = weeks.length - 1
  if (i >= 0 && !weeks[i].met) i-- // current week still in progress — skip, don't break
  for (; i >= 0 && weeks[i].met; i--) currentStreak++

  return { weeks, currentStreak }
}
