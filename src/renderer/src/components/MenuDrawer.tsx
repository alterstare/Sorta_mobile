// ☰ menu: the desktop's left tree as a slide-in drawer, with 검토 at the top.
// A swipe left on it (or a tap beside it) closes it.
import { useRef, useState } from 'react'
import type { JSX } from 'react'
import { useStore } from '../store'
import { useBack, useSwipe } from '../touch'
import Tree from './Tree'
import { FactCheckIcon, MenuIcon, VisibilityIcon } from './icons'

export default function MenuDrawer(): JSX.Element {
  const open = useStore((s) => s.menuOpen)
  const setOpen = useStore((s) => s.setMenuOpen)
  const counts = useStore((s) => s.tree?.counts)
  const openReview = useStore((s) => s.openReview)
  const close = (): void => setOpen(false)
  useBack(open, close)

  const rootRef = useRef<HTMLDivElement>(null)
  const [dx, setDx] = useState(0)
  useSwipe(rootRef, { enabled: open, onMove: (d) => setDx(Math.min(0, d)), onLeft: close })

  return (
    <div ref={rootRef} className={`menu-root ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="menu-overlay" onClick={close} style={dx ? { opacity: Math.max(0, 1 + dx / 300) } : undefined} />
      <nav className="menu-drawer" style={dx ? { transform: `translateX(${dx}px)`, transition: 'none' } : undefined}>
        <div className="menu-head">
          <button className="icon-btn" title="닫기" onClick={close}>
            <MenuIcon />
          </button>
          <span className="menu-brand">Sorta</span>
        </div>
        <div className="menu-review">
          <button className="menu-item" onClick={() => openReview('character')}>
            <FactCheckIcon />
            <span className="menu-item-label">캐릭터 검토</span>
            <span className="menu-item-count">{(counts?.pending ?? 0).toLocaleString()}</span>
          </button>
          <button className="menu-item" onClick={() => openReview('rating')}>
            <VisibilityIcon />
            <span className="menu-item-label">등급 확인</span>
            <span className="menu-item-count">{(counts?.ratingReview ?? 0).toLocaleString()}</span>
          </button>
        </div>
        <div className="menu-sep" />
        <div className="menu-tree">
          <Tree />
        </div>
      </nav>
    </div>
  )
}
