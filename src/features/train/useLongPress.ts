import { useRef } from 'react'
import type React from 'react'

interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: () => void
  onPointerCancel: () => void
  onPointerLeave: () => void
  onClickCapture: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
}

/**
 * 500ms press-and-hold detector. The timer is cancelled by pointer-up,
 * pointer-cancel, pointer-leave, or >10px of movement (so scrolling a list
 * never triggers it). The click that follows a fired long-press is swallowed
 * in the capture phase so the press doesn't also activate the element.
 */
export function useLongPress(onLongPress: () => void, ms = 500): LongPressHandlers {
  const timer = useRef<number | null>(null)
  const origin = useRef({ x: 0, y: 0 })
  const fired = useRef(false)
  const callback = useRef(onLongPress)
  callback.current = onLongPress

  const clear = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  return {
    onPointerDown: (e) => {
      origin.current = { x: e.clientX, y: e.clientY }
      fired.current = false
      clear()
      timer.current = window.setTimeout(() => {
        timer.current = null
        fired.current = true
        callback.current()
      }, ms)
    },
    onPointerMove: (e) => {
      if (timer.current === null) return
      const dx = e.clientX - origin.current.x
      const dy = e.clientY - origin.current.y
      if (dx * dx + dy * dy > 100) clear()
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onClickCapture: (e) => {
      if (fired.current) {
        e.preventDefault()
        e.stopPropagation()
        fired.current = false
      }
    },
    onContextMenu: (e) => e.preventDefault(),
  }
}
