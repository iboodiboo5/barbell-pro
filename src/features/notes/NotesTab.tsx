import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import type { Note } from '../../data/db'
import { repo } from '../../data/repo'
import { Sheet } from '../../ui/Sheet'
import { Button } from '../../ui/Button'
import { PressScale } from '../../ui/PressScale'
import { haptics } from '../../ui/haptics'
import { relativeDate } from '../lifts/LiftList'

const SWIPE_REVEAL = 96
const UNDO_MS = 4000
const AUTOSAVE_MS = 500

const SETTLE = { type: 'spring', stiffness: 500, damping: 40 } as const

/**
 * Always-present inline composer: the "empty note" at the top of the list.
 * First keystroke creates the note; edits autosave (debounced); leaving the
 * field with content finalizes it into the list below; leaving it empty
 * deletes the draft. No + button, no sheet.
 */
function NoteComposer({ onComposingChange }: { onComposingChange: (id: string | null) => void }) {
  const [text, setText] = useState('')
  const textRef = useRef('')
  const idRef = useRef<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Serializes create/update/delete so a finalize can't race an in-flight create.
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const taRef = useRef<HTMLTextAreaElement>(null)

  const enqueue = (fn: () => Promise<void>) => {
    queueRef.current = queueRef.current.then(fn, fn)
  }

  const persist = (value: string) => {
    enqueue(async () => {
      if (value.trim() === '' && !idRef.current) return
      if (!idRef.current) {
        const note = await repo.addNote(value)
        idRef.current = note.id
        onComposingChange(note.id)
      } else {
        await repo.updateNote(idRef.current, value)
      }
    })
  }

  const onChange = (value: string) => {
    setText(value)
    textRef.current = value
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => persist(textRef.current), AUTOSAVE_MS)
  }

  const finalize = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const value = textRef.current
    enqueue(async () => {
      if (value.trim() === '') {
        if (idRef.current) await repo.deleteNote(idRef.current)
      } else if (!idRef.current) {
        const note = await repo.addNote(value)
        idRef.current = note.id
      } else {
        await repo.updateNote(idRef.current, value)
      }
      idRef.current = null
    })
    if (value.trim() !== '') haptics.light()
    setText('')
    textRef.current = ''
    onComposingChange(null)
  }

  // Flush a pending draft when the tab unmounts mid-typing.
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const value = textRef.current
    const id = idRef.current
    if (value.trim() !== '') {
      queueRef.current = queueRef.current.then(async () => {
        if (id) await repo.updateNote(id, value)
        else await repo.addNote(value)
      })
    } else if (id) {
      queueRef.current = queueRef.current.then(() => repo.deleteNote(id))
    }
  }, [])

  // Auto-grow with the content.
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px dashed var(--border-strong)',
        borderRadius: 'var(--radius-card)',
        padding: '12px 16px',
      }}
    >
      <textarea
        ref={taRef}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onBlur={finalize}
        placeholder="Write here"
        aria-label="New note"
        rows={2}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          resize: 'none',
          overflow: 'hidden',
          padding: 0,
          border: 'none',
          background: 'transparent',
          color: 'var(--text)',
          fontSize: 15,
          lineHeight: 1.45,
          fontFamily: 'inherit',
          outline: 'none',
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
      />
      <div style={{ marginTop: 4, fontSize: 11, fontWeight: 600, color: 'var(--text-faint)' }}>
        {text.trim() === '' ? 'Autosaves as you type' : 'Saved — tap outside to file it'}
      </div>
    </div>
  )
}

type SwipeSide = 'delete' | 'pin' | null

function NoteRow({
  note,
  swipeSide,
  onSwipe,
  onEdit,
  onDelete,
  onTogglePin,
}: {
  note: Note
  swipeSide: SwipeSide
  onSwipe: (side: SwipeSide) => void
  onEdit: () => void
  onDelete: () => void
  onTogglePin: () => void
}) {
  const x = useMotionValue(0)
  // Tie each action layer's visibility to the actual swipe offset so neither
  // peeks out from behind the card's rounded corners at rest.
  const deleteOpacity = useTransform(x, [-24, -4], [1, 0])
  const pinOpacity = useTransform(x, [4, 24], [0, 1])

  const settleTo = (side: SwipeSide) =>
    animate(x, side === 'delete' ? -SWIPE_REVEAL : side === 'pin' ? SWIPE_REVEAL : 0, SETTLE)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: -10 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      style={{ position: 'relative' }}
    >
      {/* delete affordance behind the card (right edge, swipe left) */}
      <motion.div
        aria-hidden={swipeSide !== 'delete'}
        style={{
          opacity: deleteOpacity,
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          pointerEvents: swipeSide === 'delete' ? 'auto' : 'none',
        }}
      >
        <PressScale
          onClick={onDelete}
          aria-label="Delete note"
          tabIndex={swipeSide === 'delete' ? 0 : -1}
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
      </motion.div>

      {/* pin affordance behind the card (left edge, swipe right) */}
      <motion.div
        aria-hidden={swipeSide !== 'pin'}
        style={{
          opacity: pinOpacity,
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          pointerEvents: swipeSide === 'pin' ? 'auto' : 'none',
        }}
      >
        <PressScale
          onClick={onTogglePin}
          aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
          tabIndex={swipeSide === 'pin' ? 0 : -1}
          style={{
            width: SWIPE_REVEAL - 10,
            alignSelf: 'stretch',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 16,
            background: 'var(--accent)',
            color: 'var(--text)',
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          {note.pinned ? 'Unpin' : 'Pin'}
        </PressScale>
      </motion.div>

      <motion.div
        drag="x"
        dragConstraints={{ left: -SWIPE_REVEAL, right: SWIPE_REVEAL }}
        dragElastic={{ left: 0.12, right: 0.12 }}
        dragMomentum={false}
        dragDirectionLock
        animate={{ x: swipeSide === 'delete' ? -SWIPE_REVEAL : swipeSide === 'pin' ? SWIPE_REVEAL : 0 }}
        onDragEnd={(_, info) => {
          let next: SwipeSide
          if (swipeSide !== null) {
            // already open: a decent pull back (either way) closes it
            next = Math.abs(info.offset.x) < SWIPE_REVEAL / 3 ? swipeSide : null
          } else {
            next =
              info.offset.x < -SWIPE_REVEAL / 2 ? 'delete' : info.offset.x > SWIPE_REVEAL / 2 ? 'pin' : null
          }
          if (next !== swipeSide) haptics.light()
          onSwipe(next)
          // dragMomentum={false} leaves x where the finger let go — settle explicitly.
          settleTo(next)
        }}
        onClick={() => {
          if (swipeSide !== null) {
            onSwipe(null)
            settleTo(null)
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
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-faint)' }}>
          {note.pinned && (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="var(--accent)" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-label="Pinned">
              <path d="M12 17v5" />
              <path d="M9 4h6l-1 7 3 3H7l3-3-1-7z" />
            </svg>
          )}
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
  const [swipeOpen, setSwipeOpen] = useState<{ id: string; side: 'delete' | 'pin' } | null>(null)
  // The composer's in-flight note id — hidden from the list while typing.
  const [composingId, setComposingId] = useState<string | null>(null)

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

  const openEdit = (note: Note) => {
    setEditing(note)
    setDraft(note.text)
    setSheetOpen(true)
  }

  const save = async () => {
    const text = draft.trim()
    if (text !== '' && editing) {
      await repo.updateNote(editing.id, text)
      haptics.success()
    }
    setSheetOpen(false)
  }

  const togglePin = async (note: Note) => {
    haptics.light()
    setSwipeOpen(null)
    await repo.setNotePinned(note.id, !note.pinned)
  }

  const deleteWithUndo = async (note: Note) => {
    haptics.warning()
    setSwipeOpen(null)
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

  // Pinned notes float to the top; sort is stable so createdAt order holds
  // within each group.
  const visibleNotes = (notes ?? [])
    .filter((n) => n.id !== composingId)
    .sort((a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false))

  return (
    <div style={{ paddingTop: 8 }}>
      <header style={{ padding: '8px 20px 14px' }}>
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em' }}>Notes</h1>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 16px' }}>
        <NoteComposer onComposingChange={setComposingId} />
        <AnimatePresence initial={false}>
          {visibleNotes.map((n) => (
            <NoteRow
              key={n.id}
              note={n}
              swipeSide={swipeOpen?.id === n.id ? swipeOpen.side : null}
              onSwipe={(side) => setSwipeOpen(side ? { id: n.id, side } : null)}
              onEdit={() => openEdit(n)}
              onDelete={() => void deleteWithUndo(n)}
              onTogglePin={() => void togglePin(n)}
            />
          ))}
        </AnimatePresence>
      </div>

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
        title="Edit note"
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
