// Bottom activity bar (as in Halftone): the running job's progress in one
// line; tap → the list of this session's jobs. Hidden until a job ran.
import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import { useStore } from '../store'
import { useBack } from '../touch'
import { ArrowDownIcon, ArrowUpIcon, CloseIcon } from './icons'

const pct = (done: number, total: number): number => (total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0)

export default function ActivityBar(): JSX.Element | null {
  const jobs = Object.values(useStore((s) => s.jobs)).sort((a, b) => b.jobId - a.jobId)
  const open = useStore((s) => s.activityOpen)
  const toggle = useStore((s) => s.toggleActivity)
  const clearDone = useStore((s) => s.clearDoneJobs)
  const ref = useRef<HTMLDivElement>(null)
  useBack(open, toggle)
  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) toggle()
    }
    document.addEventListener('pointerdown', down, true)
    return () => document.removeEventListener('pointerdown', down, true)
  }, [open, toggle])
  if (!jobs.length) return null
  const running = jobs.filter((j) => j.state === 'running' || j.state === 'queued')
  const cur = running[0]
  const summary = cur
    ? `${cur.label}${cur.total > 0 ? ` · ${pct(cur.done, cur.total)}%` : ' · 진행 중…'}`
    : `작업 ${jobs.length}개 · 진행 중인 작업 없음`
  const sub = (j: (typeof jobs)[number]): string =>
    j.state === 'failed'
      ? `오류: ${j.error ?? '실패'}`
      : j.state === 'cancelled'
        ? '중간에 멈춤'
        : j.state === 'done'
          ? '완료'
          : j.total > 0
            ? `${j.done.toLocaleString()} / ${j.total.toLocaleString()} (${pct(j.done, j.total)}%)`
            : '진행 중…'
  return (
    <div className="activity" ref={ref}>
      {open && (
        <div className="activity-panel">
          <div className="activity-panel-head">
            <span>작업 목록 ({jobs.length})</span>
            <div className="flat-group">
              <button className="mini" disabled={running.length === jobs.length} onClick={clearDone}>
                완료 지우기
              </button>
            </div>
          </div>
          <div className="activity-panel-list">
            {jobs.map((j) => (
              <div key={j.jobId} className={`activity-row ${j.state}`}>
                <div className="activity-row-main">
                  <div className="activity-row-title">{j.label}</div>
                  <div className="activity-row-sub">{sub(j)}</div>
                  {(j.state === 'running' || j.state === 'done') && (
                    <div className="activity-bar-track">
                      <div
                        className={`activity-bar-fill ${j.total === 0 && j.state === 'running' ? 'indet' : ''}`}
                        style={{ width: j.state === 'done' ? '100%' : `${pct(j.done, j.total)}%` }}
                      />
                    </div>
                  )}
                </div>
                {j.state === 'running' && (
                  <button className="mini icon" title="멈추기" onClick={() => void window.api.cancelJob(j.jobId)}>
                    <CloseIcon />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="activity-bar" onClick={toggle}>
        <span className="activity-bar-summary">{summary}</span>
        {running.length > 0 && <span className="activity-bar-count">{running.length}개 진행</span>}
        <span className="activity-bar-caret">{open ? <ArrowDownIcon /> : <ArrowUpIcon />}</span>
      </div>
    </div>
  )
}
