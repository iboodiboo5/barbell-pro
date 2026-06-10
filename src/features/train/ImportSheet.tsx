import { useMemo, useState } from 'react'
import { parseWorkoutPaste } from '../../lib/workoutPaste'
import type { ParsedWeek } from '../../lib/workoutPaste'
import { importParsedWeeks, weekOfLabel } from '../../data/programImport'
import { Sheet } from '../../ui/Sheet'
import { Button } from '../../ui/Button'
import { haptics } from '../../ui/haptics'
import { sound } from '../../ui/sound'
import { toast } from '../../ui/Toast'

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function previewLabel(week: ParsedWeek, index: number): string {
  return week.label ?? (week.date ? weekOfLabel(week.date) : `Week ${index + 1}`)
}

function loadLabel(ex: { loadKg: number; loadText?: string }): string {
  if (ex.loadText) return ex.loadText
  return ex.loadKg > 0 ? `${ex.loadKg} kg` : '—'
}

interface ImportSheetProps {
  open: boolean
  onClose: () => void
  onImported: (firstWeekId: string) => void
}

/**
 * Paste-import: drop one or more coach-sheet weeks (TSV from Excel/Sheets)
 * into the textarea, check the live preview, import additively.
 */
export function ImportSheet({ open, onClose, onImported }: ImportSheetProps) {
  const [text, setText] = useState('')
  const [importing, setImporting] = useState(false)

  const weeks = useMemo(() => parseWorkoutPaste(text), [text])
  const dayCount = weeks.reduce((n, w) => n + w.days.length, 0)
  const exCount = weeks.reduce((n, w) => n + w.days.reduce((m, d) => m + d.exercises.length, 0), 0)

  const runImport = async () => {
    if (weeks.length === 0 || importing) return
    setImporting(true)
    try {
      const { result, firstWeekId } = await importParsedWeeks(weeks)
      haptics.success()
      sound.complete()
      toast(`Imported ${plural(result.weeks, 'week')} · ${plural(result.exercises, 'exercise')}`)
      setText('')
      if (firstWeekId) onImported(firstWeekId)
      onClose()
    } catch {
      toast('Import failed — nothing was changed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Import workouts"
      footer={
        <Button fullWidth disabled={weeks.length === 0 || importing} onClick={() => void runImport()}>
          {weeks.length === 0 ? 'Import' : `Import ${plural(weeks.length, 'week')}`}
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 8 }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          placeholder={'Paste a week from your coach sheet…'}
          aria-label="Pasted workout data"
          spellCheck={false}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid var(--border-strong)',
            background: 'var(--surface-2)',
            color: 'var(--text)',
            fontSize: 12.5,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            lineHeight: 1.5,
            outline: 'none',
            resize: 'none',
            whiteSpace: 'pre',
            userSelect: 'text',
            WebkitUserSelect: 'text',
          }}
        />

        {weeks.length === 0 ? (
          <p style={{ margin: '0 2px', fontSize: 13, lineHeight: 1.55, color: 'var(--text-dim)' }}>
            Copy a week straight from Excel or Google Sheets — dates, day names,
            loads, sets × reps and comments are picked up automatically. You can
            paste several weeks at once.
          </p>
        ) : (
          <>
            <div style={{ margin: '0 2px', fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
              {plural(weeks.length, 'week')} · {plural(dayCount, 'day')} · {plural(exCount, 'exercise')}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {weeks.map((week, wi) => (
                <div
                  key={wi}
                  style={{
                    borderRadius: 'var(--radius-card)',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    padding: '12px 14px',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text)' }}>
                    {previewLabel(week, wi)}
                  </div>
                  {week.days.map((day, di) => (
                    <div key={di} style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)' }}>
                        {day.name}
                        {day.date && (
                          <span style={{ color: 'var(--text-faint)', fontWeight: 600 }}>
                            {' '}· {new Date(`${day.date}T00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
                        {day.exercises.map((ex, ei) => (
                          <div
                            key={ei}
                            style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13 }}
                          >
                            <span
                              style={{
                                flex: 1,
                                minWidth: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                fontWeight: 600,
                                color: 'var(--text)',
                              }}
                            >
                              {ex.name}
                            </span>
                            <span style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums', color: 'var(--text-dim)' }}>
                              {loadLabel(ex)} × {ex.sets} × {ex.repsText ?? ex.reps}
                            </span>
                            {ex.remarks.length > 0 && (
                              <span
                                aria-label={`${ex.remarks.length} comments`}
                                style={{
                                  flexShrink: 0,
                                  padding: '1px 6px',
                                  borderRadius: 7,
                                  background: 'var(--accent-soft)',
                                  color: 'var(--accent)',
                                  fontSize: 11,
                                  fontWeight: 700,
                                }}
                              >
                                {ex.remarks.length}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}
