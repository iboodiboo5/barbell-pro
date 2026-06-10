import { AnimatePresence, motion } from 'motion/react'
import { useEffect, type ReactNode } from 'react'
import { haptics } from './haptics'

interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

/**
 * iOS-style bottom sheet. Springs up, drag-down to dismiss (>120px), tap
 * backdrop to close. Content scrolls internally up to ~88vh.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  useEffect(() => {
    if (open) haptics.light()
  }, [open])

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
              maxHeight: '88vh',
              background: 'var(--surface)',
              borderTopLeftRadius: 'var(--radius-sheet)',
              borderTopRightRadius: 'var(--radius-sheet)',
              border: '1px solid var(--border)',
              borderBottom: 'none',
              paddingBottom: 'calc(16px + var(--safe-bottom))',
              touchAction: 'none',
            }}
          >
            {/* grabber */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                paddingTop: 10,
                paddingBottom: 6,
                flexShrink: 0,
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
                  flexShrink: 0,
                }}
              >
                {title}
              </div>
            )}

            {/* content scrolls internally; stop pointer events from starting a
                panel drag so scrolling works — drag-dismiss via grabber/title */}
            <div
              onPointerDownCapture={(e) => e.stopPropagation()}
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
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
