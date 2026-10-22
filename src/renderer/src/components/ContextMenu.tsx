// Long-press menu with one level of sub-menus (as in Halftone). Closes on a
// tap beside it, Android back or a leaf tap.
import { useLayoutEffect, useRef, useState } from 'react'
import { useBack } from '../touch'
import type { JSX, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { KeyboardArrowRightIcon } from './icons'

export interface MenuItem {
  label: string
  icon?: ReactNode
  onClick?: () => void
  disabled?: boolean
  checked?: boolean
  children?: MenuItem[]
  separator?: boolean // draws a line above
}

// A submenu that would run past the window's bottom / right edge moves up /
// opens to the left instead.
function useFit(open: boolean): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!open || !el) return
    const r = el.getBoundingClientRect()
    if (r.bottom > window.innerHeight - 8) el.style.top = `${el.offsetTop - (r.bottom - window.innerHeight + 8)}px`
    if (r.right > window.innerWidth - 8) {
      el.style.left = 'auto'
      el.style.right = '100%'
      el.style.marginLeft = '0'
      el.style.marginRight = '2px'
    }
  }, [open])
  return ref
}

function Row({ item, onClose }: { item: MenuItem; onClose: () => void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const subRef = useFit(open)
  const sep = item.separator ? <div className="ctx-sep" /> : null
  if (item.children) {
    return (
      <>
        {sep}
        <div className="ctx-item has-sub" onClick={(e) => (e.stopPropagation(), setOpen((o) => !o))}>
          <span className="ctx-icon">{item.icon}</span>
          <span className="ctx-label">{item.label}</span>
          <span className="ctx-arrow">
            <KeyboardArrowRightIcon />
          </span>
          {open && (
            <div className="ctx-submenu" ref={subRef}>
              {item.children.map((c, i) => (
                <Row key={i} item={c} onClose={onClose} />
              ))}
            </div>
          )}
        </div>
      </>
    )
  }
  return (
    <>
      {sep}
      <button
        className={`ctx-item ${item.checked ? 'checked' : ''}`}
        disabled={item.disabled}
        onClick={() => {
          onClose()
          item.onClick?.()
        }}
      >
        <span className="ctx-icon">{item.icon}</span>
        <span className="ctx-label">{item.label}</span>
      </button>
    </>
  )
}

// On the phone: centred over a dim backdrop (a tap beside it or Android back
// closes it); sub-menus open below their row.
export default function ContextMenu({ items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }): JSX.Element {
  useBack(true, onClose)
  return createPortal(
    <>
      <div className="ctx-back" onClick={onClose} onContextMenu={(e) => e.preventDefault()} />
      <div className="ctx-menu" onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
        {items.map((it, i) => (
          <Row key={i} item={it} onClose={onClose} />
        ))}
      </div>
    </>,
    document.body
  )
}
