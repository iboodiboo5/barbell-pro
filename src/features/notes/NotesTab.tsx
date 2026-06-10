import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, animate, motion, useMotionValue } from 'motion/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import type { Note } from '../../data/db'
import { repo } from '../../data/repo'
import { Sheet } from '../../ui/Sheet'
import { Button } from '../../ui/Button'
import { PressScale } from '../../ui/PressScale'
import { haptics } from '../../ui/haptics'
import { sound } from '../../ui/sound'
import { relativeDate } from '../lifts/LiftsTab'

const SWIPE_REVEAL = 96
const UNDO_MS = 4000

const SETTLE = { type: 'spring', stiffness: 500, damping: 40 } as const

function NoteRow({
  note,
  swipeOpen,
  onSwipe,
  onEdit,
  onDelete,
}: {
  note: Note
  swipeOpen: boolean
  onSwipe: (open: boolean) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const x = useMotionValue(0)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: -10 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      style={{ position: 'relative' }}
    >
      {/* delete affordance behind the card */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}
      >
        <PressScale
          onClick={onDelete}
          aria-label="Delete note"
          tabIndex={swipeOpen ? 0 : -1}
          style={{
            width: SWIPE_REVEAL - 10,
            alignSelf: 'stretch',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 16,
            background: 'var(--danger)',
            color: 'var(--text)',
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          Delete
        </PressScale>
      </div>

      <motion.div
        drag="x"
        dragConstraints={{ left: -SWIPE_REVEAL, right: 0 }}
        dragElastic={{ left: 0.12, right: 0 }}
        dragMomentum={false}
        dragDirectionLock
        animate={{ x: swipeOpen ? -SWIPE_REVEAL : 0 }}
        onDragEnd={(_, info) => {
          const next = swipeOpen ? info.offset.x < SWIPE_REVEAL / 3 : info.offset.x < -SWIPE_REVEAL / 2
          if (next !== swipeOpen) haptics.light()
          onSwipe(next)
          // dragMomentum={false} leaves x where the finger let go — settle explicitly.
          animate(x, next ? -SWIPE_REVEAL : 0, SETTLE)
        }}
        onClick={() => {
          if (swipeOpen) {
            onSwipe(false)
            animate(x, 0, SETTLE)
          } else {
            onEdit()
          }
        }}
        style={{
          x,
          position: 'relative',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card)',
          padding: '14px 16px',
          cursor: 'pointer',
          touchAction: 'pan-y',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 15,
            lineHeight: 1.45,
            color: 'var(--text)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            display: '-webkit-box',
            WebkitLineClamp: 4,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {note.text}
        </p>
        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: 'var(--text-faint)' }}>
          {relativeDate(note.createdAt)}
        </div>
      </motion.div>
    </motion.div>
  )
}

export function NotesTab() {
  const notes = useLiveQuery(
    () => db.notes.orderBy('createdAt').reverse().toArray(),
    [],
  )

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Note | null>(null)
  const [draft, setDraft] = useState('')
  const [swipeOpenId, setSwipeOpenId] = useState<string | null>(null)

  // Undo state: the deleted note is kept in memory for a few seconds.
  const [undoNote, setUndoNote] = useState<Note | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current)
  }, [])

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (sheetOpen) {
      // wait for the sheet spring before grabbing focus
      const t = setTimeout(() => textareaRef.current?.focus(), 320)
      return () => clearTimeout(t)
    }
  }, [sheetOpen])

  const openNew = () => {
    setEditing(null)
    setDraft('')
    setSheetOpen(true)
  }

  const openEdit = (note: Note) => {
    setEditing(note)
    setDraft(note.text)
    setSheetOpen(true)
  }

  const save = async () => {
    const text = draft.trim()
    if (text === '') {
      setSheetOpen(false)
      return
    }
    if (editing) await repo.updateNote(editing.id, text)
    else await repo.addNote(text)
    haptics.success()
    sound.complete()
    setSheetOpen(false)
  }

  const deleteWithUndo = async (note: Note) => {
    haptics.warning()
    setSwipeOpenId(null)
    await repo.deleteNote(note.id)
    setUndoNote(note)
    if (undoTimer.current) clearTimeout(undoTimer.current)
    undoTimer.current = setTimeout(() => setUndoNote(null), UNDO_MS)
  }

  const undo = async () => {
    if (!undoNote) return
    const n = undoNote
    setUndoNote(null)
    if (undoTimer.current) clearTimeout(undoTimer.current)
    await db.notes.add({ ...n, updatedAt: Date.now() })
    haptics.light()
  }

  return (
    <div style={{ paddingTop: 8 }}>
      <header style={{ padding: '8px 20px 14px' }}>
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em' }}>Notes</h1>
      </header>

      {notes && notes.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
            padding: '64px 32px',
            textAlign: 'center',
          }}
        >
          <svg width="120" height="84" viewBox="0 0 120 84" fill="none" aria-hidden="true">
            <rect x="22" y="8" width="76" height="68" rx="10" fill="var(--surface)" stroke="var(--border-strong)" />
            <path d="M34 26h52M34 38h52M34 50h36" stroke="var(--border-strong)" strokeWidth="3" strokeLinecap="round" />
            <path d="M88 56l14-14 6 6-14 14-7.5 1.5L88 56z" fill="var(--accent)" opacity="0.85" />
          </svg>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>No notes yet</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-dim)' }}>
            Cues, programming ideas, gym thoughts — jot them here.
          </div>
        </motion.div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 16px' }}>
          <AnimatePresence initial={false}>
            {(notes ?? []).map((n) => (
              <NoteRow
                key={n.id}
                note={n}
                swipeOpen={swipeOpenId === n.id}
                onSwipe={(open) => setSwipeOpenId(open ? n.id : null)}
                onEdit={() => openEdit(n)}
                onDelete={() => void deleteWithUndo(n)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* FAB */}
      <PressScale
        onClick={openNew}
        aria-label="Add note"
        style={{
          position: 'fixed',
          right: 20,
          bottom: 'calc(84px + var(--safe-bottom))',
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--accent)',
          boxShadow: '0 8px 24px var(--accent-soft)',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </PressScale>

      {/* undo pill */}
      <AnimatePresence>
        {undoNote && (
          <motion.div
            initial={{ y: 64, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 64, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            style={{
              position: 'fixed',
              left: '50%',
              translateX: '-50%',
              bottom: 'calc(84px + var(--safe-bottom))',
              zIndex: 45,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '10px 16px',
              borderRadius: 999,
              background: 'var(--surface-2)',
              border: '1px solid var(--border-strong)',
              boxShadow: '0 8px 28px rgba(0, 0, 0, .45)',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Note deleted</span>
            <button
              onClick={() => void undo()}
              style={{
                border: 'none',
                background: 'none',
                color: 'var(--accent)',
                fontSize: 14,
                fontWeight: 800,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing ? 'Edit note' : 'New note'}
        footer={
          <Button fullWidth onClick={() => void save()}>
            Save
          </Button>
        }
      >
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write it down…"
          aria-label="Note text"
          rows={6}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            resize: 'none',
            padding: '12px 14px',
            borderRadius: 14,
            background: 'var(--surface-2)',
            border: '1px solid var(--border-strong)',
            color: 'var(--text)',
            fontSize: 15,
            lineHeight: 1.5,
            fontFamily: 'inherit',
            outline: 'none',
            userSelect: 'text',
            WebkitUserSelect: 'text',
          }}
        />
      </Sheet>
    </div>
  )
}
