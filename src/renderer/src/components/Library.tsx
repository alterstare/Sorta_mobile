// 라이브러리 (phone): search box with the sort icon at its right end, then
// ↑↓ · 전체 · 즐겨찾기 … + (분류 · 그룹 · 보기 · 마스킹), then the grid.
// The tree is in the ☰ menu.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store'
import { useBack } from '../touch'
import type { LibraryNode, RatingPick, SafeMode, SortKey } from '../../../shared/types'
import { AddIcon, ArrowDownIcon, ArrowUpIcon, CheckIcon, CloseIcon, FavoriteIcon, RefreshIcon, SearchIcon, SettingsIcon, SortIcon } from './icons'
import ThumbGrid, { safeMode } from './ThumbGrid'
import type { ThumbSize } from './ThumbGrid'
import Viewer from './Viewer'
import SelectionBar from './SelectionBar'

const ALL: RatingPick[] = ['general', 'sensitive', 'r18']
const RATING_NAMES: [RatingPick, string][] = [
  ['general', '일반'],
  ['sensitive', '민감'],
  ['r18', 'R-18']
]
const SORTS: [SortKey, string][] = [
  ['name', '이름'],
  ['date', '날짜'],
  ['type', '유형'],
  ['size', '크기'],
  ['stars', '평점'],
  ['random', '무작위']
]
const SIZES: [ThumbSize, string][] = [
  ['l', '큰 아이콘'],
  ['m', '보통 아이콘'],
  ['s', '작은 아이콘']
]
const SAFE: [SafeMode, string][] = [
  ['show', '표시'],
  ['blur', '블러'],
  ['hide', '숨기기']
]

// The open node's name (shown above the grid when it isn't 전체).
function nodeName(n: LibraryNode, tree: ReturnType<typeof useStore.getState>['tree']): string {
  if (!tree) return ''
  switch (n.type) {
    case 'all':
      return ''
    case 'favorite':
      return '즐겨찾기'
    case 'group':
      return tree.groups.find((g) => g.id === n.id)?.name ?? '그룹'
    case 'series':
      return tree.series.find((s) => s.id === n.id)?.name ?? ''
    case 'pending':
      return '캐릭터 검토'
    case 'ratingReview':
      return '등급 확인'
    case 'unknown':
      return '미확인'
    case 'other':
      return '캐릭터 아닌 그림'
    case 'groupShot':
      return n.id === undefined ? '단체 사진' : `${tree.series.find((s) => s.id === n.id)?.name ?? ''} · 단체 사진`
    case 'unclassified':
      return '분류 전'
    case 'setAside':
      return '따로 둔 중복'
    case 'dups':
      return '중복 의심'
  }
  // a character or a 소속, anywhere in the tree
  type A = { id: number; name: string; children: A[]; characters: { id: number; name: string; children?: { id: number; name: string }[] }[] }
  const findChar = (list: { id: number; name: string; children?: { id: number; name: string }[] }[]): string | null => {
    for (const c of list) {
      if (n.type === 'character' && c.id === n.id) return c.name
      for (const v of c.children ?? []) if (n.type === 'character' && v.id === n.id) return v.name
    }
    return null
  }
  const findAff = (list: A[]): string | null => {
    for (const a of list) {
      if (n.type === 'affiliation' && a.id === n.id) return a.name
      const x = findAff(a.children) ?? findChar(a.characters)
      if (x) return x
    }
    return null
  }
  for (const s of tree.series) {
    const x = findAff(s.affiliations as A[]) ?? findChar(s.characters)
    if (x) return x
  }
  return ''
}

export default function Library(): JSX.Element {
  const { settings, saveSettings, setView, filter, setRatings, setSort, setDir, setGroupFilter, setFavOnly, setNode, setQuery, reshuffle, images, tree, status } =
    useStore()
  const groups = tree?.groups ?? []
  const items = useMemo(() => images.filter((i) => safeMode(i, settings) !== 'hide'), [images, settings])
  const [q, setQ] = useState(filter.q)
  useEffect(() => setQ(filter.q), [filter.q])
  const [sortOpen, setSortOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  useBack(sortOpen, () => setSortOpen(false))
  useBack(moreOpen, () => setMoreOpen(false))

  const ratings = filter.ratings
  const isAll = ALL.every((r) => ratings.includes(r))
  const toggleAll = (): void => {
    if (!isAll) setRatings([...ALL], ratings)
    else setRatings(settings?.libRatingsPrev?.length && !ALL.every((r) => settings.libRatingsPrev!.includes(r)) ? settings.libRatingsPrev : ['general'], null)
  }
  const toggleRating = (r: RatingPick): void => {
    const next = ratings.includes(r) ? ratings.filter((x) => x !== r) : ALL.filter((x) => x === r || ratings.includes(x))
    if (next.length) setRatings(next)
  }
  const groupSel = (filter.groups ?? []).filter((id) => groups.some((g) => g.id === id))
  const narrowed = !isAll || groupSel.length > 0

  // 전체 / 즐겨찾기 counts within the open node
  const favCount = useMemo(() => images.filter((i) => i.favorite).length, [images])
  const [allCount, setAllCount] = useState<number | null>(null)
  useEffect(() => {
    if (!filter.favOnly) return setAllCount(null)
    let alive = true
    void window.api.images({ ...filter, favOnly: false }).then((l) => alive && setAllCount(l.length))
    return () => {
      alive = false
    }
  }, [filter, images])
  const here = nodeName(filter.node, tree)
  const empty = status.state === 'ready' && tree?.counts.all === 0

  return (
    <div className="library">
      <section className="grid-pane">
        <div className={`lib-head ${status.state === 'ready' ? '' : 'off'}`}>
          <form
            className="search-row"
            onSubmit={(e) => {
              e.preventDefault()
              setQuery(q.trim())
              ;(document.activeElement as HTMLElement | null)?.blur()
            }}
          >
            <SearchIcon />
            <input
              value={q}
              placeholder="캐릭터 · 게임 · 파일 이름 검색"
              enterKeyHint="search"
              onChange={(e) => {
                setQ(e.target.value)
                if (!e.target.value) setQuery('')
              }}
            />
            {q && (
              <button type="button" className="search-clear" title="지우기" onClick={() => (setQ(''), setQuery(''))}>
                <CloseIcon />
              </button>
            )}
            <button type="button" className="search-sort" title="정렬" onClick={() => setSortOpen(true)}>
              <SortIcon />
            </button>
          </form>
          <div className="chips flat-group">
            <button className="mini icon" title={filter.dir === 'asc' ? '오름차순' : '내림차순'} onClick={() => setDir(filter.dir === 'asc' ? 'desc' : 'asc')}>
              {filter.dir === 'asc' ? <ArrowUpIcon /> : <ArrowDownIcon />}
            </button>
            <button className={`mini ${!filter.favOnly ? 'on' : ''}`} onClick={() => setFavOnly(false)}>
              전체 {(filter.favOnly ? allCount : items.length)?.toLocaleString() ?? ''}
            </button>
            <button className={`mini fav-chip ${filter.favOnly ? 'on' : ''}`} onClick={() => setFavOnly(!filter.favOnly)}>
              <FavoriteIcon filled />
              즐겨찾기 {favCount.toLocaleString()}
            </button>
            <span className="spacer" />
            <button className={`mini icon ${narrowed ? 'on' : ''}`} title="분류 · 그룹 · 보기 · 마스킹" onClick={() => setMoreOpen(true)}>
              <AddIcon />
            </button>
          </div>
          {here && (
            <div className="node-row">
              <span className="node-name">{here}</span>
              <button className="mini icon" title="전체 보기" onClick={() => setNode({ type: 'all' })}>
                <CloseIcon />
              </button>
            </div>
          )}
        </div>
        <SelectionBar allIds={items.map((i) => i.id)} />
        {status.state === 'setup' ? (
          <div className="grid">
            <div className="empty">
              <SettingsIcon />
              <p>설정에서 NAS(WebDAV)를 연결하고 Sorta의 정리 폴더를 고르면, PC에서 분류한 그림이 여기에 보입니다.</p>
              <button className="btn primary" onClick={() => setView('settings')}>
                설정 열기
              </button>
            </div>
          </div>
        ) : status.state === 'loading' && !tree?.counts.all ? (
          <div className="grid">
            <div className="empty">
              <span className="spinner" />
              <p>NAS에서 분류 정보를 불러오는 중입니다…</p>
            </div>
          </div>
        ) : status.state === 'error' ? (
          <div className="grid">
            <div className="empty">
              <p>{status.message}</p>
              <div className="flat-group">
                <button className="mini" onClick={() => void window.api.reload()}>
                  <RefreshIcon />
                  다시 시도
                </button>
                <button className="mini" onClick={() => setView('settings')}>
                  <SettingsIcon />
                  설정
                </button>
              </div>
            </div>
          </div>
        ) : empty ? (
          <div className="grid">
            <div className="empty">
              <p>분류 정보 파일에 그림이 없습니다. PC의 Sorta에서 그림을 분류하면 여기에 보입니다.</p>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="grid">
            <div className="empty">
              <p>{filter.favOnly ? '즐겨찾기한 그림이 없습니다.' : '조건에 맞는 그림이 없습니다.'}</p>
            </div>
          </div>
        ) : (
          <ThumbGrid items={items} />
        )}
      </section>
      <Viewer items={items} />

      {sortOpen && (
        <Sheet title="정렬" onClose={() => setSortOpen(false)}>
          {SORTS.map(([k, l]) => (
            <Opt
              key={k}
              on={filter.sort === k}
              onClick={() => {
                setSortOpen(false)
                if (k === 'random' && filter.sort === 'random') reshuffle()
                else setSort(k)
              }}
            >
              {l}
              {k === 'random' && filter.sort === 'random' && <span className="dim"> · 다시 섞기</span>}
            </Opt>
          ))}
        </Sheet>
      )}
      {moreOpen && (
        <Sheet title="보기 설정" onClose={() => setMoreOpen(false)}>
          <div className="sheet-sec">분류</div>
          <Opt box on={isAll} onClick={toggleAll}>
            전체
          </Opt>
          {RATING_NAMES.map(([r, l]) => (
            <Opt key={r} box on={ratings.includes(r)} onClick={() => toggleRating(r)}>
              {l}
            </Opt>
          ))}
          <div className="sheet-sec">그룹</div>
          <Opt box on={!groupSel.length} onClick={() => setGroupFilter([])}>
            모든 그림
          </Opt>
          {groups.map((g) => (
            <Opt key={g.id} box on={groupSel.includes(g.id)} onClick={() => setGroupFilter(groupSel.includes(g.id) ? groupSel.filter((x) => x !== g.id) : [...groupSel, g.id])}>
              {g.name}
              <span className="dim"> {g.count.toLocaleString()}</span>
            </Opt>
          ))}
          <button
            className="sheet-opt new"
            onClick={() => {
              setMoreOpen(false)
              useStore.getState().setGroupDialog([])
            }}
          >
            <AddIcon />새 그룹
          </button>
          <div className="sheet-sec">보기</div>
          {SIZES.map(([k, l]) => (
            <Opt key={k} on={settings?.thumbSize === k} onClick={() => void saveSettings({ thumbSize: k })}>
              {l}
            </Opt>
          ))}
          {(
            [
              ['safeR18', 'R-18 마스킹'],
              ['safeSensitive', '민감 마스킹']
            ] as const
          ).map(([key, title]) => (
            <div key={key}>
              <div className="sheet-sec">{title}</div>
              <div className="flat-group sheet-row">
                {SAFE.map(([v, l]) => (
                  <button key={v} className={`mini ${settings?.[key] === v ? 'on' : ''}`} onClick={() => void saveSettings({ [key]: v })}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Sheet>
      )}
    </div>
  )
}

// Bottom sheet (the phone's dropdown): slides up over a dim backdrop.
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  return createPortal(
    <div className="sheet-back" onClick={onClose}>
      <div ref={ref} className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <span>{title}</span>
          <button className="icon-btn" title="닫기" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body
  )
}

export function Opt({ on, onClick, children, box = false }: { on: boolean; onClick: () => void; children: React.ReactNode; box?: boolean }): JSX.Element {
  return (
    <button className={`sheet-opt ${on ? 'on' : ''}`} role={box ? 'menuitemcheckbox' : 'menuitemradio'} aria-checked={on} onClick={onClick}>
      <span className={box ? 'menu-box' : 'menu-radio'}>{on && (box ? <CheckIcon /> : <span className="menu-dot" />)}</span>
      {children}
    </button>
  )
}
