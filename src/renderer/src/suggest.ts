// Library search suggestions (same as PC Sorta's LibrarySearch): games, 소속,
// characters, groups and the tree's lists (단체 사진, 미확인 …), matched by
// name — exact, then start, then anywhere; games before 소속 before
// characters, then by picture count.
import type { LibraryNode, LibraryTree, TreeAffiliation, TreeCharacter } from '../../shared/types'

export type Hit = { node: LibraryNode; name: string; path: string; count: number; kind: 'series' | 'aff' | 'char' | 'group' | 'list' }

export function collect(tree: LibraryTree): Hit[] {
  const out: Hit[] = []
  const c = tree.counts
  const lists: [LibraryNode, string, number | null][] = [
    [{ type: 'favorite' }, '즐겨찾기', c.favorite],
    [{ type: 'pending' }, '캐릭터 검토', c.pending],
    [{ type: 'ratingReview' }, '등급 확인', c.ratingReview],
    [{ type: 'unknown' }, '미확인', c.unknown],
    [{ type: 'groupShot' }, '단체 사진', c.groupShot],
    [{ type: 'original' }, '오리지널', c.original],
    [{ type: 'other' }, '기타', c.other],
    [{ type: 'unclassified' }, '분류 전', c.unclassified],
    [{ type: 'dups' }, '중복 의심', tree.dups],
    [{ type: 'setAside' }, '따로 둔 중복', c.setAside]
  ]
  for (const [node, name, n] of lists) if (n) out.push({ node, name, path: '목록', count: n, kind: 'list' })
  for (const g of tree.groups) out.push({ node: { type: 'group', id: g.id }, name: g.name, path: '그룹', count: g.count, kind: 'group' })
  for (const s of tree.series) {
    out.push({ node: { type: 'series', id: s.id }, name: s.name, path: '게임', count: s.count, kind: 'series' })
    if (s.groupShots) out.push({ node: { type: 'groupShot', id: s.id }, name: '단체 사진', path: s.name, count: s.groupShots, kind: 'list' })
    const chars = (list: TreeCharacter[], path: string): void => {
      for (const c of list) {
        out.push({ node: { type: 'character', id: c.id }, name: c.name, path, count: c.count, kind: 'char' })
        if (c.children) chars(c.children, `${path} › ${c.name}`)
      }
    }
    const affs = (list: TreeAffiliation[], path: string): void => {
      for (const a of list) {
        out.push({ node: { type: 'affiliation', id: a.id }, name: a.name, path, count: a.count, kind: 'aff' })
        affs(a.children, `${path} › ${a.name}`)
        chars(a.characters, `${path} › ${a.name}`)
      }
    }
    affs(s.affiliations, s.name)
    chars(s.characters, s.name)
  }
  return out
}

const KIND_ORDER: Record<Hit['kind'], number> = { series: 0, aff: 1, char: 2, group: 3, list: 4 }

export function match(all: Hit[], q: string, max = 30): Hit[] {
  const t = q.trim().toLowerCase()
  if (!t) return []
  const score = (h: Hit): number => {
    const n = h.name.toLowerCase()
    return n === t ? 0 : n.startsWith(t) ? 1 : n.includes(t) ? 2 : -1
  }
  return all
    .map((h) => ({ h, s: score(h) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s || KIND_ORDER[a.h.kind] - KIND_ORDER[b.h.kind] || b.h.count - a.h.count)
    .slice(0, max)
    .map((x) => x.h)
}

export const hitKey = (h: Hit): string => `${h.node.type}${'id' in h.node ? (h.node.id ?? '') : ''}`
