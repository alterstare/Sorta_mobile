// 올리기: the pictures in the phone folder (설정 › 올리기), 작은 아이콘 grid.
// 전체 올리기 sends what isn't on the NAS yet; 올린 그림 삭제 removes from the
// phone only what the NAS has (same size). Progress shows in the bottom bar.
import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { useStore } from '../store'
import { useKept } from '../keep'
import type { UploadItem } from '../../../shared/ipc'
import { CheckCircleIcon, CloudUploadIcon, DeleteIcon, RefreshIcon, SettingsIcon } from './icons'
import { Sheet } from './Library'
import { useBack } from '../touch'

const COLS = 3
const PHONE_W = 420
const GAP = 4
const PAD = 8

export default function UploadView(): JSX.Element {
  const settings = useStore((s) => s.settings)
  const setView = useStore((s) => s.setView)
  const showToast = useStore((s) => s.showToast)
  const jobs = useStore((s) => s.jobs)
  const [list, setList] = useKept<UploadItem[] | null>('upload.list', null)
  const [err, setErr] = useState<string | null>(null)
  const [ask, setAsk] = useState(false)
  useBack(ask, () => setAsk(false))
  const busy = Object.values(jobs).some((j) => j.state === 'running' && (j.label.startsWith('NAS에 올리기') || j.label.startsWith('올린 그림')))

  const load = (): void => {
    setErr(null)
    window.api
      .uploadList()
      .then(setList)
      .catch((e: Error) => setErr(String(e.message ?? e)))
  }
  useEffect(load, [settings?.uploadFrom])
  const wasBusy = useRef(busy)
  useEffect(() => {
    if (wasBusy.current && !busy) load()
    wasBusy.current = busy
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy])

  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 400, h: 600, top: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox((b) => ({ ...b, w: el.clientWidth, h: el.clientHeight })))
    ro.observe(el)
    return () => ro.disconnect()
  }, [list === null])

  const ready = !!settings?.uploadFrom && !!settings?.uploadTo
  const items = list ?? []
  const done = items.filter((i) => i.uploaded).length
  const cols = COLS * Math.max(1, Math.floor(box.w / PHONE_W))
  const cell = (box.w - PAD * 2 - GAP * (cols - 1)) / cols
  const rowH = cell + GAP
  const rows = Math.ceil(items.length / cols)
  const first = Math.max(0, Math.floor((box.top - PAD) / rowH) - 3)
  const last = Math.min(rows, Math.ceil((box.top + box.h) / rowH) + 3)
  const cells: JSX.Element[] = []
  for (let r = first; r < last; r++)
    for (let c = 0; c < cols; c++) {
      const f = items[r * cols + c]
      if (!f) break
      cells.push(
        <div key={f.path} className={`up-cell ${f.uploaded ? 'done' : ''}`} style={{ left: PAD + c * (cell + GAP), top: PAD + r * rowH, width: cell, height: cell }}>
          <img src={window.api.localThumbUrl(f.path, f.mtime)} loading="lazy" draggable={false} />
          {f.uploaded && (
            <span className="up-done" title="NAS에 올리기 완료">
              <CheckCircleIcon />
            </span>
          )}
        </div>
      )
    }

  return (
    <div className="upload">
      <div className="up-head">
        <div className="up-info">
          {ready ? (
            <>
              <div className="up-title">{settings!.uploadFrom.split('/').filter(Boolean).pop()}</div>
              <div className="row-desc">
                {items.length.toLocaleString()}장 · 올리기 완료 {done.toLocaleString()}장
              </div>
            </>
          ) : (
            <div className="row-desc">설정 › 올리기에서 휴대폰 폴더와 NAS에 올릴 위치를 정하세요.</div>
          )}
        </div>
        <div className="flat-group">
          {ready ? (
            <>
              <button className="mini" title="새로 고침" disabled={busy} onClick={load}>
                <RefreshIcon />
              </button>
              <button
                className="mini primary"
                disabled={busy || done === items.length}
                onClick={() => void window.api.uploadAll().then((r) => (showToast(r), load()))}
              >
                <CloudUploadIcon />
                전체 올리기
              </button>
              <button className="mini danger" disabled={busy || !done} onClick={() => setAsk(true)}>
                <DeleteIcon />
                올린 그림 삭제
              </button>
            </>
          ) : (
            <button className="mini" onClick={() => setView('settings')}>
              <SettingsIcon />
              설정
            </button>
          )}
        </div>
      </div>
      {err && <div className="row-desc err pad">{err}</div>}
      <div
        ref={ref}
        className="grid up-grid"
        onScroll={(e) => {
          const top = e.currentTarget.scrollTop
          setBox((b) => (Math.abs(b.top - top) < rowH / 3 ? b : { ...b, top }))
        }}
      >
        {ready && list && items.length === 0 && (
          <div className="empty">
            <p>이 폴더에 그림이 없습니다.</p>
          </div>
        )}
        <div className="grid-inner" style={{ height: PAD * 2 + rows * rowH }}>
          {cells}
        </div>
      </div>
      {ask && (
        <Sheet title="올린 그림 삭제" onClose={() => setAsk(false)}>
          <div className="row-desc">
            NAS에 올리기를 마친 {done.toLocaleString()}장을 휴대폰에서 지웁니다. 지우기 전에 NAS에 같은 크기로 있는지 다시 확인하고, 확인되지 않은 그림은 남겨 둡니다. 휴대폰에서 지운 그림은 되돌릴 수 없습니다.
          </div>
          <div className="sheet-foot flat-group">
            <span className="spacer" />
            <button className="mini" onClick={() => setAsk(false)}>
              취소
            </button>
            <button
              className="mini danger"
              onClick={() => {
                setAsk(false)
                void window.api.deleteUploaded().then((r) => (showToast(r), load()))
              }}
            >
              <DeleteIcon />
              삭제
            </button>
          </div>
        </Sheet>
      )}
    </div>
  )
}
