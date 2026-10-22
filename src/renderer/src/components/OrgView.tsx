// 관리 › 소속 (phone): one game's 조직도 as an indented tree. 소속 미지정
// stays on top; tap any character to pick its 소속 (or make a new one). Boxes
// get sub-소속 (＋) and new names (✎). Moving boxes / deleting stay on the PC.
import { useEffect, useMemo, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { useStore } from '../store'
import { useKeptScroll } from '../keep'
import { useBack } from '../touch'
import type { OrgChart, OrgCharacter, OrgNode } from '../../../shared/types'
import { AddIcon, EditIcon } from './icons'
import { Opt, Sheet } from './Library'
import { orgRows, useAct } from './ManageView'

const LAST_GAME = 'sorta.org.game'

export default function OrgView({ tabs }: { tabs: ReactNode }): JSX.Element {
  const pageRef = useKeptScroll<HTMLDivElement>('org')
  const libraryVersion = useStore((s) => s.libraryVersion)
  const [games, setGames] = useState<{ name: string; n: number }[]>([])
  const [game, setGame] = useState<string>(() => {
    try {
      return localStorage.getItem(LAST_GAME) ?? ''
    } catch {
      return ''
    }
  })
  const [chart, setChart] = useState<OrgChart | null>(null)
  const [assign, setAssign] = useState<OrgCharacter | null>(null)
  const [name, setName] = useState<{ mode: 'add' | 'rename'; node: OrgNode | null } | null>(null)
  useBack(!!assign, () => setAssign(null))
  useBack(!!name, () => setName(null))

  useEffect(() => {
    void window.api.characters().then((cs) => {
      const m = new Map<string, number>()
      for (const c of cs) if (!c.parentId) m.set(c.series, (m.get(c.series) ?? 0) + 1)
      const list = [...m].map(([name, n]) => ({ name, n })).sort((a, b) => a.name.localeCompare(b.name))
      setGames(list)
      setGame((g) => (list.some((x) => x.name === g) ? g : (list.slice().sort((a, b) => b.n - a.n)[0]?.name ?? '')))
    })
  }, [libraryVersion])
  useEffect(() => {
    if (!game) return setChart(null)
    try {
      localStorage.setItem(LAST_GAME, game)
    } catch {
      // per-device convenience only
    }
    void window.api.orgChart(game).then(setChart)
  }, [game, libraryVersion])
  const act = useAct(() => game && void window.api.orgChart(game).then(setChart))

  const kids = useMemo(() => {
    const m = new Map<number | null, OrgNode[]>()
    for (const n of chart?.nodes ?? []) m.set(n.parentId, [...(m.get(n.parentId) ?? []), n])
    for (const l of m.values()) l.sort((a, b) => a.order - b.order || a.id - b.id)
    return m
  }, [chart])
  const members = useMemo(() => {
    const m = new Map<number | null, OrgCharacter[]>()
    for (const c of chart?.characters ?? []) m.set(c.affiliationId, [...(m.get(c.affiliationId) ?? []), c])
    return m
  }, [chart])
  const unplaced = members.get(null) ?? []

  const chip = (c: OrgCharacter): JSX.Element => (
    <button key={c.id} className="tag-chip org-char" onClick={() => setAssign(c)}>
      {c.name}
    </button>
  )
  const branch = (parent: number | null, depth: number): JSX.Element[] =>
    (kids.get(parent) ?? []).map((n) => {
      const chars = members.get(n.id) ?? []
      return (
        <div key={n.id} className="m-org-node" style={{ '--depth': depth } as React.CSSProperties}>
          <div className="m-org-box">
            <div className="org-head">
              <span className="org-name" title={n.aliases.length ? `이전 이름: ${n.aliases.join(', ')}` : undefined}>
                {n.name}
              </span>
              <span className="org-tools flat-group">
                <button className="mini icon" title="하위 소속 추가" onClick={() => setName({ mode: 'add', node: n })}>
                  <AddIcon />
                </button>
                <button className="mini icon" title="이름 변경" onClick={() => setName({ mode: 'rename', node: n })}>
                  <EditIcon />
                </button>
              </span>
            </div>
            {chars.length > 0 && <div className="chip-row">{chars.map(chip)}</div>}
          </div>
          {branch(n.id, depth + 1)}
        </div>
      )
    })

  return (
    <div ref={pageRef} className="page org">
      <div className="page-head stack">
        <h1>관리</h1>
        {tabs}
      </div>
      <div className="org-bar">
        <select className="tag-input" value={game} onChange={(e) => setGame(e.target.value)}>
          {games.map((g) => (
            <option key={g.name} value={g.name}>
              {g.name} ({g.n}명)
            </option>
          ))}
        </select>
        <div className="flat-group">
          <button className="mini" disabled={!chart} onClick={() => setName({ mode: 'add', node: null })}>
            <AddIcon />
            소속 추가
          </button>
        </div>
      </div>
      {chart && (
        <div className="org-unplaced card">
          <div className="row-title">
            소속 미지정 · {unplaced.length}명<span className="dim"> · 눌러서 소속 지정</span>
          </div>
          <div className="chip-row">
            {unplaced.map(chip)}
            {unplaced.length === 0 && <span className="row-desc">모든 캐릭터에 소속이 있습니다.</span>}
          </div>
        </div>
      )}
      {chart && (
        <div className="m-org">
          {branch(null, 0)}
          {!chart.nodes.length && <div className="row-desc pad">아직 소속이 없습니다. 소속 추가를 누르세요.</div>}
        </div>
      )}
      {assign && chart && <AssignSheet c={assign} chart={chart} act={act} onClose={() => setAssign(null)} />}
      {name && chart && (
        <NameSheet
          title={name.mode === 'add' ? (name.node ? `${name.node.name} 아래 소속 추가` : '소속 추가') : '소속 이름 변경'}
          initial={name.mode === 'rename' ? (name.node?.name ?? '') : ''}
          onClose={() => setName(null)}
          onDone={(v) => {
            const n = name
            setName(null)
            if (n.mode === 'add') void act(() => window.api.addAffiliation(chart.series, v, n.node?.id ?? null), '소속 추가')
            else if (n.node && v !== n.node.name) void act(() => window.api.renameAffiliation(n.node!.id, v), '소속 이름 변경')
          }}
        />
      )}
    </div>
  )
}

function AssignSheet({ c, chart, act, onClose }: { c: OrgCharacter; chart: OrgChart; act: ReturnType<typeof useAct>; onClose: () => void }): JSX.Element {
  const [q, setQ] = useState('')
  const rows = useMemo(() => orgRows(chart), [chart])
  const t = q.trim().toLowerCase()
  const shown = t ? rows.filter((r) => [r.name, ...r.aliases].some((x) => x.toLowerCase().includes(t))) : rows
  const exact = rows.some((r) => r.name.toLowerCase() === t)
  const place = (id: number | null): void => {
    onClose()
    void act(() => window.api.placeCharacters([c.id], id), id === null ? '소속 해제' : '소속 지정')
  }
  return (
    <Sheet title={`${c.name} · 소속 지정`} onClose={onClose}>
      <input className="tag-input sheet-search" value={q} placeholder="소속 찾기 · 새 소속 이름" onChange={(e) => setQ(e.target.value)} />
      {!t && (
        <Opt on={c.affiliationId === null} onClick={() => place(null)}>
          소속 미지정
        </Opt>
      )}
      {shown.map((r) => (
        <Opt key={r.id} on={c.affiliationId === r.id} onClick={() => place(r.id)}>
          <span style={{ paddingLeft: t ? 0 : r.depth * 14 }}>{r.name}</span>
        </Opt>
      ))}
      {t && !exact && (
        <button
          className="sheet-opt new"
          onClick={() => {
            onClose()
            void act(async () => window.api.placeCharacters([c.id], await window.api.addAffiliation(chart.series, q.trim(), null)), '소속 추가 · 지정')
          }}
        >
          <AddIcon />"{q.trim()}" 새 소속으로 지정
        </button>
      )}
    </Sheet>
  )
}

function NameSheet({ title, initial, onClose, onDone }: { title: string; initial: string; onClose: () => void; onDone: (v: string) => void }): JSX.Element {
  const [v, setV] = useState(initial)
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="learn-row sheet-new">
        <input
          className="tag-input"
          autoFocus
          value={v}
          placeholder="소속 이름"
          enterKeyHint="done"
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && v.trim() && onDone(v.trim())}
        />
        <div className="flat-group">
          <button className="mini" disabled={!v.trim()} onClick={() => onDone(v.trim())}>
            {initial ? '바꾸기' : '추가'}
          </button>
        </div>
      </div>
    </Sheet>
  )
}
