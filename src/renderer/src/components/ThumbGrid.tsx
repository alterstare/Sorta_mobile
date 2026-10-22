// Thumbnails (phone): 격자형 only. Columns by icon size on a bar phone's
// width — 작은 3, 보통 2, 큰 1 (wider screens: more of each). Virtualized by
// rows. Tap opens 크게 보기; a long press starts selecting (taps then toggle).
import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { useStore } from '../store'
import { useKept } from '../keep'
import type { ImageItem, Settings } from '../../../shared/types'
import { CheckIcon, WarningIcon } from './icons'
import { FavGroup, Stars } from './Rate'
import { useImageMenu } from './ImageMenu'
import { longPress } from '../touch'

export type ThumbSize = Settings['thumbSize']
export const COLS: Record<ThumbSize, number> = { s: 3, m: 2, l: 1 }
const PHONE_W = 420 // a bar phone's width: COLS fit across it
const GAP = 6
const FOOT_H = 30 // stars + ♥/＋
const LABEL_H = 22
const PAD = 8

export const RATING_LABEL: Record<ImageItem['rating'], string> = {
  general: '일반',
  sensitive: '민감',
  r18: 'R-18',
  unknown: '미정'
}

export function safeMode(img: ImageItem, s: Settings | null): 'show' | 'blur' | 'hide' {
  if (!s) return 'show'
  if (img.rating === 'r18') return s.safeR18
  if (img.rating === 'sensitive') return s.safeSensitive
  return 'show'
}

export function charLabel(img: ImageItem): string {
  const named = img.characters.filter((c) => c.name)
  if (named.length) return named.map((c) => c.name).join(', ')
  if (img.kind === 'other') return '캐릭터 아닌 그림'
  if (img.kind === 'group') return img.groupSeries ? `단체 사진 · ${img.groupSeries}` : '단체 사진'
  return img.characters.length ? '미확인' : '분류 전'
}

export const fmtSize = (n: number | null): string =>
  n === null ? '' : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`

function Thumb({ img, settings, size }: { img: ImageItem; settings: Settings | null; size: number }): JSX.Element {
  const [broken, setBroken] = useState(false)
  const mode = safeMode(img, settings)
  const pending = img.characters.some((x) => x.status === 'pending')
  return (
    <div className="cell-img" style={{ width: size, height: size }}>
      {img.thumb && !broken ? (
        <img
          src={window.api.thumbUrl(img.thumb, img.path)}
          className={mode === 'blur' ? 'blur' : ''}
          loading="lazy"
          draggable={false}
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="cell-broken">
          <WarningIcon />
        </span>
      )}
      {img.rating !== 'general' && img.rating !== 'unknown' && <span className={`badge r-${img.rating}`}>{RATING_LABEL[img.rating]}</span>}
      {pending && <span className="badge pending">검토</span>}
      {img.ratingReview && <span className="badge rating-review">등급?</span>}
    </div>
  )
}

export default function ThumbGrid({ items }: { items: ImageItem[] }): JSX.Element {
  const settings = useStore((s) => s.settings)
  const size = settings?.thumbSize ?? 's'
  const openViewer = useStore((s) => s.openViewer)
  const selected = useStore((s) => s.selected)
  const selecting = useStore((s) => s.selecting)
  const setSelected = useStore((s) => s.setSelected)
  const setSelecting = useStore((s) => s.setSelecting)
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 400, h: 600, top: 0 })
  const { onContextMenu, menu } = useImageMenu(items)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox((b) => ({ ...b, w: el.clientWidth, h: el.clientHeight })))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // Scroll position per list (filter), kept while away from the library.
  const listKey = useStore((s) => s.imagesKey)
  const [saved, setSaved] = useKept<{ key: string; top: number }>('grid.scroll', { key: '', top: 0 })
  const topRef = useRef(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const top = saved.key === listKey ? saved.top : 0
    el.scrollTop = top
    topRef.current = el.scrollTop
    setBox((b) => ({ ...b, top: el.scrollTop }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey])
  useEffect(() => () => setSaved({ key: listKey, top: topRef.current }), [listKey, setSaved])

  const inner = Math.max(1, box.w - PAD * 2)
  const cols = COLS[size] * Math.max(1, Math.floor(box.w / PHONE_W))
  const cellW = (inner - GAP * (cols - 1)) / cols
  const rowH = cellW + FOOT_H + LABEL_H + GAP

  // Closing 크게 보기: the grid shows the picture that was open and flashes it.
  const viewerIndex = useStore((s) => s.viewerIndex)
  const lastViewed = useRef<number | null>(null)
  const [flash, setFlash] = useState<number | null>(null)
  useEffect(() => {
    if (viewerIndex !== null) {
      lastViewed.current = viewerIndex
      return
    }
    const i = lastViewed.current
    lastViewed.current = null
    const el = ref.current
    if (i === null || !el || !items[i]) return
    const r = Math.floor(i / cols)
    const top = PAD + r * rowH
    if (top < el.scrollTop || top + rowH > el.scrollTop + el.clientHeight) {
      el.scrollTop = Math.max(0, top - (el.clientHeight - rowH) / 2)
      topRef.current = el.scrollTop
      setBox((b) => ({ ...b, top: el.scrollTop }))
    }
    setFlash(items[i].id)
    const t = window.setTimeout(() => setFlash(null), 1600)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerIndex])

  const rows = Math.ceil(items.length / cols)
  const first = Math.max(0, Math.floor((box.top - PAD) / rowH) - 3)
  const last = Math.min(rows, Math.ceil((box.top + box.h) / rowH) + 3)

  const toggle = (img: ImageItem): void => {
    const n = new Set(selected)
    if (n.has(img.id)) n.delete(img.id)
    else n.add(img.id)
    setSelected(n)
  }
  // Footer actions apply to the whole selection when the image is in it.
  const targets = (img: ImageItem): ImageItem[] => (selected.has(img.id) && selected.size > 1 ? items.filter((x) => selected.has(x.id)) : [img])

  const cells: JSX.Element[] = []
  for (let r = first; r < last; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      const img = items[i]
      if (!img) break
      const on = selected.has(img.id)
      cells.push(
        <div
          key={img.id}
          className={`cell ${on ? 'sel' : ''} ${flash === img.id ? 'found-flash' : ''} ${selecting ? 'selecting' : ''}`}
          style={{ left: PAD + c * (cellW + GAP), top: PAD + r * rowH, width: cellW }}
          onClick={() => (selecting ? toggle(img) : openViewer(i))}
          {...longPress((e) => {
            if (selecting) onContextMenu(e, img)
            else {
              setSelecting(true)
              setSelected(new Set([img.id]))
            }
          })}
        >
          <Thumb img={img} settings={settings} size={cellW} />
          {selecting && <span className={`cell-check ${on ? 'on' : ''}`}>{on && <CheckIcon />}</span>}
          <div className="cell-foot" onClick={(e) => e.stopPropagation()}>
            <Stars imgs={targets(img)} size={cols >= 3 ? 11 : 14} />
            <FavGroup imgs={targets(img)} noGroup={cols >= 3} />
          </div>
          <div className="cell-label">{charLabel(img)}</div>
        </div>
      )
    }
  }

  return (
    <div
      className="grid"
      ref={ref}
      onScroll={(e) => {
        const top = e.currentTarget.scrollTop
        topRef.current = top
        setBox((b) => (Math.abs(b.top - top) < rowH / 3 ? b : { ...b, top }))
      }}
    >
      <div key={listKey} className="grid-inner" style={{ height: PAD * 2 + rows * rowH }}>
        {cells}
      </div>
      {menu}
    </div>
  )
}
