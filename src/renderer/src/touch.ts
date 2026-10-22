// Phone helpers: the Android back button (a stack of open things, topmost
// closes first), horizontal swipes and long presses.
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

const backStack: { id: number; fn: () => void }[] = []
let backSeq = 0

// While `active`, Android back runs `fn` (later registrations first).
export function useBack(active: boolean, fn: () => void): void {
  const cb = useRef(fn)
  cb.current = fn
  useEffect(() => {
    if (!active) return
    const id = ++backSeq
    backStack.push({ id, fn: () => cb.current() })
    return () => {
      const i = backStack.findIndex((x) => x.id === id)
      if (i >= 0) backStack.splice(i, 1)
    }
  }, [active])
}

export function popBack(): boolean {
  const top = backStack[backStack.length - 1]
  if (!top) return false
  top.fn()
  return true
}

export interface SwipeOpts {
  onLeft?: () => void // finger moved left
  onRight?: () => void
  onMove?: (dx: number) => void // follow the finger (0 = released)
  enabled?: boolean
  min?: number // px to count as a swipe
}

// Horizontal swipe on an element. Vertical drags pass through (lists scroll);
// two-finger touches (pinch) are ignored.
export function useSwipe(ref: RefObject<HTMLElement | null>, o: SwipeOpts): void {
  const cb = useRef(o)
  cb.current = o
  useEffect(() => {
    const el = ref.current
    if (!el || o.enabled === false) return
    let s: { x: number; y: number; t: number; lock: 'h' | 'v' | null; dx: number } | null = null
    const start = (e: TouchEvent): void => {
      const t = e.touches[0]
      s = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, t: Date.now(), lock: null, dx: 0 } : null
    }
    const move = (e: TouchEvent): void => {
      if (!s) return
      if (e.touches.length > 1) {
        s = null
        cb.current.onMove?.(0)
        return
      }
      const t = e.touches[0]
      const dx = t.clientX - s.x
      const dy = t.clientY - s.y
      if (!s.lock) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
        s.lock = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'h' : 'v'
      }
      if (s.lock !== 'h') return
      e.preventDefault()
      s.dx = dx
      cb.current.onMove?.(dx)
    }
    const end = (): void => {
      const s0 = s
      s = null
      if (!s0 || s0.lock !== 'h') return
      cb.current.onMove?.(0)
      const min = cb.current.min ?? 70
      const fast = Math.abs(s0.dx) > 30 && Math.abs(s0.dx) / Math.max(1, Date.now() - s0.t) > 0.5
      if (s0.dx <= -min || (fast && s0.dx < 0)) cb.current.onLeft?.()
      else if (s0.dx >= min || (fast && s0.dx > 0)) cb.current.onRight?.()
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end, { passive: true })
    el.addEventListener('touchcancel', end, { passive: true })
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
    }
  }, [ref, o.enabled])
}

// Long press (480ms without moving) → fn; the click that follows is swallowed.
// One finger at a time, so the state is shared (survives re-renders).
const lp = { timer: null as ReturnType<typeof setTimeout> | null, fired: false, x: 0, y: 0 }
const lpClear = (): void => {
  if (lp.timer) clearTimeout(lp.timer)
  lp.timer = null
}
export function longPress(fn: (e: { clientX: number; clientY: number }) => void): {
  onTouchStart: (e: React.TouchEvent) => void
  onTouchMove: (e: React.TouchEvent) => void
  onTouchEnd: () => void
  onClickCapture: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
} {
  return {
    onTouchStart: (e) => {
      lp.fired = false
      const t = e.touches[0]
      lp.x = t.clientX
      lp.y = t.clientY
      lpClear()
      lp.timer = setTimeout(() => {
        lp.fired = true
        lp.timer = null
        navigator.vibrate?.(15)
        fn({ clientX: lp.x, clientY: lp.y })
      }, 480)
    },
    onTouchMove: (e) => {
      const t = e.touches[0]
      if (Math.abs(t.clientX - lp.x) > 10 || Math.abs(t.clientY - lp.y) > 10) lpClear()
    },
    onTouchEnd: lpClear,
    onClickCapture: (e) => {
      if (lp.fired) {
        e.stopPropagation()
        e.preventDefault()
        lp.fired = false
      }
    },
    onContextMenu: (e) => e.preventDefault()
  }
}
