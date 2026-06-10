// Pure parser for coach-sheet pastes (TSV from Excel / Google Sheets).
// No db access; importer lives in src/data/programImport.ts.
//
// Tolerated formats (see docs/superpowers/specs/2026-06-11-paste-import-design.md):
// date lines (DD/MM/YYYY, ISO, combined "Thursday 25/12/25", "Week 1 - 19/09/2022"),
// weekday/"Day N" headers, single-line exercises, Load/Sets/Reps header blocks with
// ramp rows, wellness rows, "Superset" markers, lb/kg/plate/BW loads, duration reps.

export interface ParsedExercise {
  name: string
  loadKg: number
  loadText?: string
  sets: number
  reps: number
  repsText?: string
  remarks: string[]
}

export interface ParsedDay {
  name: string
  date?: string
  exercises: ParsedExercise[]
}

export interface ParsedWeek {
  label?: string
  date?: string
  days: ParsedDay[]
}

// ─── cell parsers ────────────────────────────────────────────────────────────

const LBS_PER_KG = 0.45359237

export function parseLoad(raw: string): { kg: number; text?: string } {
  const t = raw.trim()
  if (!t) return { kg: 0 }
  if (/^\d+(\.\d+)?$/.test(t)) return { kg: Number(t) }
  const kg = t.match(/^(\d+(?:\.\d+)?)\s*kgs?$/i)
  if (kg) return { kg: Number(kg[1]) }
  const lb = t.match(/^(\d+(?:\.\d+)?)\s*lbs?$/i)
  if (lb) return { kg: Math.round(Number(lb[1]) * LBS_PER_KG * 10) / 10, text: t }
  return { kg: 0, text: t }
}

export function parseSets(raw: string): { sets: number; remark?: string } {
  const t = raw.trim()
  if (!t) return { sets: 1 }
  if (/^\d+(\.\d+)?$/.test(t)) {
    const n = Math.floor(Number(t))
    return { sets: Math.max(1, n) }
  }
  return { sets: 1, remark: t }
}

export function parseReps(raw: string): { reps: number; text?: string } {
  const t = raw.trim()
  if (!t) return { reps: 1 }
  if (/^\d+(\.\d+)?$/.test(t)) return { reps: Math.max(1, Math.floor(Number(t))) }
  const lead = t.match(/^(\d+)/)
  if (lead) return { reps: Math.max(1, Number(lead[1])), text: t }
  return { reps: 1, text: t }
}

// ─── small helpers ───────────────────────────────────────────────────────────

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const curr: number[] = [i]
    for (let j = 1; j <= b.length; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1])
    }
    prev = curr
  }
  return prev[b.length]
}

function canonicalWeekday(raw: string): string | null {
  const norm = raw.trim().toLowerCase()
  for (const d of WEEKDAYS) if (d.toLowerCase() === norm) return d
  if (norm.length >= 5) {
    let best: string | null = null
    let bestDist = Infinity
    for (const d of WEEKDAYS) {
      const dist = levenshtein(norm, d.toLowerCase())
      if (dist <= 2 && dist < bestDist) { bestDist = dist; best = d }
    }
    return best
  }
  return null
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** "03/11/2025", "25/12/25" (DD/MM), "2025-11-03", "2025-11-03 00:00:00" → ISO date. */
function parseDateToken(raw: string): string | null {
  const t = raw.trim()
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{1,2}:\d{2}(?::\d{2})?)?$/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m) {
    let y = Number(m[3])
    if (y < 100) y += 2000
    return `${y}-${pad2(Number(m[2]))}-${pad2(Number(m[1]))}`
  }
  return null
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00`)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** Monday-anchored weekday index of an ISO date. */
function mondayIndexOfDate(iso: string): number {
  return (new Date(`${iso}T00:00`).getDay() + 6) % 7
}

function splitCells(line: string): string[] {
  const cells = line.includes('\t')
    ? line.split('\t')
    : line.trim().split(/\s{2,}/)
  return cells.map((c) => c.trim())
}

const HEADER_NOISE = /^(load|sets|reps|notes?|rpe)$/i
const WELLNESS = new Set(['sleep quality', 'fatigue', 'desire to train', 'stress', 'soreness'])

function extraCells(cells: string[], from: number): string[] {
  return cells.slice(from).filter((c) => c && !HEADER_NOISE.test(c))
}

// ─── block model ─────────────────────────────────────────────────────────────

interface Row { load: string; sets: string; reps: string; extras: string[] }
interface Block { name: string; rows: Row[]; remarks: string[]; supersetWithPrev: boolean }

/** Raw cell text for ramp summaries; falls back to the parsed value. */
function describeRow(row: Row): string {
  const load = row.load || String(parseLoad(row.load).kg)
  const sets = row.sets || String(parseSets(row.sets).sets)
  const reps = row.reps || String(parseReps(row.reps).reps)
  return `${load}×${sets}×${reps}`
}

function blockToExercise(b: Block): ParsedExercise {
  const remarks: string[] = [...b.remarks]
  let loadKg = 0
  let loadText: string | undefined
  let sets = 1
  let reps = 1
  let repsText: string | undefined

  if (b.rows.length > 0) {
    const parsed = b.rows.map((row) => {
      const lp = parseLoad(row.load)
      const sp = parseSets(row.sets)
      const rp = parseReps(row.reps)
      const extras = [...row.extras]
      if (sp.remark) extras.push(sp.remark)
      return { row, kg: lp.kg, text: lp.text, sets: sp.sets, reps: rp.reps, repsText: rp.text, extras }
    })

    let mainIdx = 0
    for (let i = 1; i < parsed.length; i++) {
      const p = parsed[i]
      const m = parsed[mainIdx]
      if (p.kg > m.kg || (p.kg === m.kg && p.sets > m.sets)) mainIdx = i
    }
    const main = parsed[mainIdx]
    loadKg = main.kg
    loadText = main.text
    sets = main.sets
    reps = main.reps
    repsText = main.repsText

    const before = parsed.slice(0, mainIdx)
    const after = parsed.slice(mainIdx + 1)
    if (before.length > 0) remarks.push(`Ramp: ${before.map((p) => describeRow(p.row)).join(', ')}`)
    for (const p of after) remarks.push(`+ ${describeRow(p.row)}`)
    remarks.push(...main.extras)
    for (const p of [...before, ...after]) remarks.push(...p.extras)
  }

  if (b.supersetWithPrev) remarks.push('Superset with previous')

  // dedupe, drop empties, keep order
  const seen = new Set<string>()
  const finalRemarks = remarks.filter((r) => {
    if (!r || seen.has(r)) return false
    seen.add(r)
    return true
  })

  return { name: b.name, loadKg, loadText, sets, reps, repsText, remarks: finalRemarks }
}

// ─── main parser ─────────────────────────────────────────────────────────────

export function parseWorkoutPaste(text: string): ParsedWeek[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')

  const weeks: ParsedWeek[] = []
  let week: ParsedWeek | null = null
  let day: ParsedDay | null = null
  let block: Block | null = null
  let supersetNext = false
  let pendingWellnessValues = false

  const ensureWeek = (): ParsedWeek => {
    if (!week) {
      week = { days: [] }
      weeks.push(week)
    }
    return week
  }

  const ensureDay = (): ParsedDay => {
    const w = ensureWeek()
    if (!day) {
      day = { name: 'Day 1', exercises: [] }
      w.days.push(day)
    }
    return day
  }

  const flushBlock = () => {
    if (!block) return
    const b = block
    block = null
    ensureDay().exercises.push(blockToExercise(b))
  }

  const startWeek = (partial: { label?: string; date?: string }) => {
    flushBlock()
    week = { ...partial, days: [] }
    weeks.push(week)
    day = null
    supersetNext = false
  }

  const openBlock = (name: string, remarks: string[]) => {
    block = { name, rows: [], remarks, supersetWithPrev: supersetNext }
    supersetNext = false
  }

  for (const line of lines) {
    const cells = splitCells(line)
    while (cells.length < 4) cells.push('')
    const [c0, c1, c2, c3] = cells
    const nonEmpty = cells.filter(Boolean)

    // blank → block separator
    if (nonEmpty.length === 0) {
      flushBlock()
      continue
    }

    // value row following a wellness header
    if (pendingWellnessValues) {
      pendingWellnessValues = false
      if (nonEmpty.every((c) => /^\d+(\.\d+)?$/.test(c) || /^enter value$/i.test(c))) continue
    }

    // wellness header row
    if (WELLNESS.has(c0.toLowerCase())) {
      flushBlock()
      pendingWellnessValues = true
      continue
    }

    const hasData = Boolean(c1 || c2 || c3)

    // "Week 1 - 19/09/2022" label line
    if (/^week\b/i.test(c0) && !hasData) {
      const dateMatch = c0.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})|(\d{4}-\d{2}-\d{2})/)
      const date = dateMatch ? parseDateToken(dateMatch[0]) : null
      if (date || /^week\s*\d+\s*$/i.test(c0)) {
        startWeek({ label: c0.split(/\s*[-–—]\s*/)[0].trim(), date: date ?? undefined })
        continue
      }
    }

    // standalone date line → new week
    if (!hasData) {
      const date = parseDateToken(c0)
      if (date) {
        startWeek({ date })
        continue
      }
    }

    // day header (weekday, misspelled weekday, "Day N", combined "Thursday 25/12/25")
    if (!hasData) {
      const dayLine = parseDayLine(c0)
      if (dayLine) {
        flushBlock()
        const w = ensureWeek()
        if (w.days.some((d) => d.name === dayLine.name)) {
          startWeek({})
        }
        const target = ensureWeek()
        let date = dayLine.date
        const weekdayIdx = WEEKDAYS.indexOf(dayLine.name)
        if (!date && target.date && weekdayIdx >= 0) {
          date = addDays(target.date, (weekdayIdx - mondayIndexOfDate(target.date) + 7) % 7)
        }
        // back-fill the week date from an explicit day date (for labeling)
        if (dayLine.date && !target.date && weekdayIdx >= 0) {
          target.date = addDays(dayLine.date, -weekdayIdx)
        }
        day = { name: dayLine.name, date, exercises: [] }
        target.days.push(day)
        continue
      }

      // "Superset" marker
      if (nonEmpty.length === 1 && /^superset$/i.test(c0)) {
        flushBlock()
        supersetNext = true
        continue
      }
    }

    // "Name  Load  Sets  Reps" header → start block
    if (c0 && /^load$/i.test(c1) && /^sets$/i.test(c2) && /^reps$/i.test(c3)) {
      flushBlock()
      openBlock(c0, extraCells(cells, 4))
      continue
    }

    // inside an open block
    if (block) {
      if (!c0 && hasData) {
        block.rows.push({ load: c1, sets: c2, reps: c3, extras: extraCells(cells, 4) })
        continue
      }
      if (!c0 && !hasData) {
        block.remarks.push(...extraCells(cells, 4))
        continue
      }
      if (c0 && hasData && block.rows.length === 0) {
        // cue or URL in the first data row's name cell
        block.remarks.push(c0)
        block.rows.push({ load: c1, sets: c2, reps: c3, extras: extraCells(cells, 4) })
        continue
      }
      flushBlock() // named line while a block has rows → new exercise below
    }

    if (c0 && hasData) {
      // single-line exercise; stays open so trailing comment rows can attach
      openBlock(c0, [])
      block!.rows.push({ load: c1, sets: c2, reps: c3, extras: extraCells(cells, 4) })
      continue
    }

    if (c0) {
      // name-only line (superset members, blocks whose data row follows)
      openBlock(c0, extraCells(cells, 4))
      continue
    }

    // comment-only line with no open block → attach to the previous exercise
    const extras = extraCells(cells, 4)
    if (extras.length > 0 && day !== null) {
      const d: ParsedDay = day
      const last = d.exercises[d.exercises.length - 1]
      if (last) last.remarks.push(...extras)
    }
  }

  flushBlock()

  // prune empty days/weeks
  for (const w of weeks) w.days = w.days.filter((d) => d.exercises.length > 0)
  return weeks.filter((w) => w.days.length > 0)
}

function parseDayLine(cell: string): { name: string; date?: string } | null {
  const t = cell.trim()
  const dayN = t.match(/^day\s*(\d+)$/i)
  if (dayN) return { name: `Day ${dayN[1]}` }
  const combined = t.match(/^([A-Za-z]+)\s+(\d{1,2}\/\d{1,2}\/\d{2,4})$/)
  if (combined) {
    const name = canonicalWeekday(combined[1])
    if (name) return { name, date: parseDateToken(combined[2]) ?? undefined }
  }
  const name = canonicalWeekday(t)
  return name ? { name } : null
}
