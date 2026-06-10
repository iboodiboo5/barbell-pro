import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { create } from 'zustand'

interface ToastState {
  msg: string | null
  /** Monotonic counter so an identical message re-pops and restarts the timer. */
  seq: number
  show: (msg: string) => void
  hide: () => void
}

const useToastStore = create<ToastState>((set) => ({
  msg: null,
  seq: 0,
  show: (msg) => set((s) => ({ msg, seq: s.seq + 1 })),
  hide: () => set({ msg: null }),
}))

/**
 * Show a transient toast pill at the top of the screen. No queue — the
 * latest message replaces whatever is showing. Requires <ToastHost/> to be
 * mounted once (App.tsx).
 */
export function toast(msg: string): void {
  useToastStore.getState().show(msg)
}

const AUTO_HIDE_MS = 2500

export function ToastHost() {
  const msg = useToastStore((s) => s.msg)
  const seq = useToastStore((s) => s.seq)
  const hide = useToastStore((s) => s.hide)

  useEffect(() => {
    if (msg === null) return
    const t = setTimeout(hide, AUTO_HIDE_MS)
    return () => clearTimeout(t)
  }, [msg, seq, hide])

  return (
    <AnimatePresence>
      {msg !== null && (
        <motion.div
          key={seq}
          role="status"
          aria-live="polite"
          initial={{ y: -72, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -72, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 480, damping: 36 }}
          style={{
            position: 'fixed',
            top: 'calc(12px + var(--safe-top))',
            left: '50%',
            x: '-50%',
            zIndex: 500,
            maxWidth: 'calc(100vw - 48px)',
            padding: '10px 18px',
            borderRadius: 999,
            background: 'var(--surface-2)',
            border: '1px solid var(--border-strong)',
            boxShadow: '0 8px 28px rgba(0, 0, 0, .45)',
            color: 'var(--text)',
            fontSize: 14,
            fontWeight: 600,
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          {msg}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
