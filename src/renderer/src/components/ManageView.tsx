// 관리 › 캐릭터 (phone): every character by game; tap one → 이름 · 소속.
// (별칭 · 게임 옮기기 · 합치기 stay on the PC.) Changes go to the PC with the
// other edits.
import { useEffect, useMemo, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { useStore } from '../store'
import { useKept, useKeptScroll } from '../keep'
import type { ManagedCharacter, OrgChart } from '../../../shared/types'
import { EditIcon, SearchIcon } from './icons'
import { Opt, Sheet } from './Library'
import { useBack } from '../touch'

type Act = (fn: () => Promise<unknown>, done?: string) => Promise<boolean>

export function useAct(reload?: () => void): Act {
  const { showToast, refreshLibrary } = useStore()
  return async (fn, done) => {
    try {
      await fn()
      if (done) showToast({ ok: true, message: done })
      reload?.()
      void refreshLibrary()
      return true
    } catch (e) {
      showToast({ ok: false, message: String((e as Error).message ?? e) })
      return false
    }
  }
}

export default function ManageView({ tabs }: { tabs: ReactNode }): JSX.Element {
  const pageRef = useKeptScroll<HTMLDivElement>('manage')
  const libraryVersion = useStore((s) => s.libraryVersion)
  const [list, setList] = useKept<ManagedCharacter[]>('manage.list', [])
  const [q, setQ] = useKept('manage.q', '')
  const [open, setOpen] = useState<number | null>(null)
  useBack(open !== null, () => setOpen(null))

  const reload = (): void => void window.api.characters().then(setList)
  useEffect(reload, [libraryVersion])
  const act = useAct(reload)

  const byId = useMemo(() => new Map(list.map((c) => [c.id, c])), [list])
  const groups = useMemo(() => {
    const t = q.trim().toLowerCase()
    const hit = (c: ManagedCharacter): boolean =>
      !t || [c.name, c.series, c.affiliation ?? '', c.tag ?? '', ...c.aliases].some((s) => s.toLowerCase().includes(t))
    const kids = new Map<number, ManagedCharacter[]>()
    for (const c of list) if (c.parentId) kids.set(c.parentId, [...(kids.get(c.parentId) ?? []), c])
    const m = new Map<string, ManagedCharacter[]>()
    for (const c of list) {
      if (c.parentId && byId.has(c.parentId)) continue
      const fam = [c, ...(kids.get(c.id) ?? [])]
      if (!fam.some(hit)) continue
      m.set(c.series, [...(m.get(c.series) ?? []), ...fam])
    }
    return [...m]
  }, [list, q, byId])
  const cur = open === null ? undefined : byId.get(open)

  return (
    <div ref={pageRef} className="page manage">
      <div className="page-head stack">
        <h1>관리</h1>
        {tabs}
      </div>
      <p className="hint">캐릭터를 누르면 이름과 소속을 고칠 수 있습니다. 바꾼 내용은 PC의 Sorta가 켜질 때 반영되고, 정리한 그림은 바뀐 폴더로 옮겨집니다.</p>
      <div className="search-box">
        <SearchIcon />
        <input value={q} placeholder="이름 · 별칭 · 게임 · 소속으로 찾기" onChange={(e) => setQ(e.target.value)} />
      </div>
      {groups.length === 0 && <div className="row-desc pad">캐릭터가 없습니다.</div>}
      {groups.map(([series, chars]) => (
        <div key={series} className="manage-game">
          <div className="manage-game-title">
            {series} <span className="dim">{chars.length}</span>
          </div>
          {chars.map((c) => (
            <div key={c.id} className={`manage-row ${c.parentId ? 'variant' : ''}`} onClick={() => setOpen(c.id)}>
              <span className="manage-name">{c.name}</span>
              {c.affiliation && !c.parentId && <span className="tag-chip static">{c.affiliation}</span>}
              <span className="spacer" />
              <span className="dim">{c.images.toLocaleString()}장</span>
            </div>
          ))}
        </div>
      ))}
      {cur && <CharSheet key={cur.id} c={cur} act={act} onClose={() => setOpen(null)} />}
    </div>
  )
}

function CharSheet({ c, act, onClose }: { c: ManagedCharacter; act: Act; onClose: () => void }): JSX.Element {
  const [name, setName] = useState(c.name)
  const [chart, setChart] = useState<OrgChart | null>(null)
  const [newAff, setNewAff] = useState('')
  useEffect(() => void window.api.orgChart(c.series).then(setChart), [c.series])
  const rows = useMemo(() => orgRows(chart), [chart])
  const own = chart?.characters.find((x) => x.id === c.id)?.affiliationId ?? null
  const rename = (): void => {
    if (name.trim() && name !== c.name) void act(() => window.api.renameCharacter(c.id, name), '이름 변경')
  }
  const place = (id: number | null): void => void act(() => window.api.placeCharacters([c.id], id), id === null ? '소속 해제' : '소속 지정').then(onClose)
  return (
    <Sheet title={c.name} onClose={onClose}>
      <div className="sheet-sec">{c.series}</div>
      <div className="manage-field">
        <div className="row-title">이름</div>
        <div className="learn-row">
          <input className="tag-input" value={name} enterKeyHint="done" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && rename()} />
          <div className="flat-group">
            <button className="mini" disabled={!name.trim() || name === c.name} onClick={rename}>
              <EditIcon />
              바꾸기
            </button>
          </div>
        </div>
      </div>
      {!c.parentId && (
        <>
          <div className="sheet-sec">소속</div>
          <Opt on={own === null} onClick={() => place(null)}>
            소속 미지정
          </Opt>
          {rows.map(({ id, name: n, depth }) => (
            <Opt key={id} on={own === id} onClick={() => place(id)}>
              <span style={{ paddingLeft: depth * 14 }}>{n}</span>
            </Opt>
          ))}
          <div className="learn-row sheet-new">
            <input
              className="tag-input"
              value={newAff}
              placeholder="새 소속 이름"
              enterKeyHint="done"
              onChange={(e) => setNewAff(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && newAff.trim() && void addAndPlace()}
            />
            <div className="flat-group">
              <button className="mini" disabled={!newAff.trim()} onClick={() => void addAndPlace()}>
                만들고 지정
              </button>
            </div>
          </div>
        </>
      )}
    </Sheet>
  )
  async function addAndPlace(): Promise<void> {
    const n = newAff.trim()
    const ok = await act(async () => window.api.placeCharacters([c.id], await window.api.addAffiliation(c.series, n, null)), '소속 추가 · 지정')
    if (ok) onClose()
  }
}

// The chart's 소속 in tree order with their depth.
export function orgRows(chart: OrgChart | null): { id: number; name: string; aliases: string[]; depth: number }[] {
  if (!chart) return []
  const kids = new Map<number | null, OrgChart['nodes']>()
  for (const n of chart.nodes) kids.set(n.parentId, [...(kids.get(n.parentId) ?? []), n])
  for (const l of kids.values()) l.sort((a, b) => a.order - b.order || a.id - b.id)
  const out: { id: number; name: string; aliases: string[]; depth: number }[] = []
  const walk = (p: number | null, depth: number): void => {
    for (const n of kids.get(p) ?? []) {
      out.push({ id: n.id, name: n.name, aliases: n.aliases, depth })
      walk(n.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}
