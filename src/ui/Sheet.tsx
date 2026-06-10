import { AnimatePresence, motion, useDragControls } from 'motion/react'
import { useEffect, type ReactNode } from 'react'
import { haptics } from './haptics'

interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /** Sticky CTA slot rendered below the scroll area, above the safe-area padding. */
  footer?: ReactNode
}

/**
 * iOS-style bottom sheet. Springs up, drag-down to dismiss (>120px) from the
 * grabber/title header, tap backdrop or press Escape to close. Content
 * scrolls internally up to ~88dvh; body scroll is locked while open.
 *
 * Drag uses Motion's drag-controls pattern (dragListener={false} + a header
 * that calls dragControls.start) so pointer events inside the content reach
 * buttons normally — whileTap and haptics keep working inside the sheet.
 */
export function Sheet({ open, onClose, title, children, footer }: SheetProps) {
  const dragControls = useDragControls()

  useEffect(() => {
    if (open) haptics.light()
  }, [open])

  // Escape to close + lock body scroll while open.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 200,
              background: 'rgba(0, 0, 0, .5)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
            }}
          />
          <motion.div
            key="sheet-panel"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            drag="y"
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            // .05 resistance upward (per spec); downward follows the finger 1:1
            // and Motion springs it back to the constraint on release.
            dragElastic={{ top: 0.05, bottom: 1 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120) onClose()
            }}
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 201,
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '88dvh',
              background: 'var(--surface)',
              borderTopLeftRadius: 'var(--radius-sheet)',
              borderTopRightRadius: 'var(--radius-sheet)',
              border: '1px solid var(--border)',
              borderBottom: 'none',
              paddingBottom: 'calc(16px + var(--safe-bottom))',
            }}
          >
            {/* grabber + title: the drag handle region. Pointer-down here
                starts the panel drag via dragControls; everywhere else
                pointer events flow to content normally. */}
            <div
              onPointerDown={(e) => dragControls.start(e)}
              style={{ flexShrink: 0, touchAction: 'none' }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  paddingTop: 10,
                  paddingBottom: 6,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 5,
                    borderRadius: 999,
                    background: 'var(--border-strong)',
                  }}
                />
              </div>

              {title && (
                <div
                  style={{
                    padding: '6px 20px 12px',
                    fontSize: 18,
                    fontWeight: 700,
                    letterSpacing: '-0.02em',
                    color: 'var(--text)',
                  }}
                >
                  {title}
                </div>
              )}
            </div>

            {/* content scrolls internally */}
            <div
              style={{
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                padding: '0 20px',
                touchAction: 'pan-y',
                overscrollBehavior: 'contain',
              }}
            >
              {children}
            </div>

            {footer && (
              <div style={{ flexShrink: 0, padding: '12px 20px 0' }}>{footer}</div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
