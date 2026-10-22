// The library as the phone holds it: the 분류 정보 파일 Sorta (PC) wrote, with
// this phone's not-yet-applied changes laid over it (edits.ts). Everything the
// screens ask (tree, image list, review queue, 조직도 …) is worked out here
// from memory — the same rules as the PC (desktop core/library.ts, review.ts).
import type { Pack } from '../shared/pack'
import type { CharRef, MobileEdit, MobileImageState } from '../shared/mobile'
import type {
  CharacterHit,
  ImageItem,
  LibraryFilter,
  LibraryTree,
  ManagedCharacter,
  MatchStatus,
  OrgChart,
  Rating,
  RatingPick,
  ReviewCandidate,
  ReviewItem,
  ReviewKind,
  TreeAffiliation,
  TreeCharacter,
  TreeCounts
} from '../shared/types'
import { joinPath } from './native'

export interface MSeries {
  id: number
  name: string
  aliases: string[]
  tag: string | null
  wiki: string | null
}
export interface MAff {
  id: number
  sid: number
  name: string
  aliases: string[]
  parent: number | null
  order: number
}
export interface MChar {
  id: number
  key?: string // pack key (c12): names it to the PC
  name: string
  aliases: string[]
  tag: string | null
  sid: number
  parent: number | null
  aff: number | null
}
export interface MRow {
  c: number | null
  st: MatchStatus
  src: string
  conf: number | null
  cand: { c: number; score: number }[] | null
}
export interface MImage {
  id: number
  sha: string
  p: string
  r?: number
  path: string // on the NAS ('' = its folder isn't linked on the phone)
  thumb: string
  name: string
  size: number | null
  order: number // place in the file (≈ import order) — 날짜 sort
  rating: Rating
  rs: string
  score: number | null
  rr: number
  kind: string
  fav: number
  stars: number
  go: number
  gs: number | null
  aside: number
  classified: boolean
  rows: MRow[]
  groups: number[]
}
export interface MGroup {
  id: number
  name: string
  order: number
}

const ALL_RATINGS: RatingPick[] = ['general', 'sensitive', 'r18']
const SORTED = (r: MRow): boolean => r.st === 'auto' || r.st === 'confirmed'
const lower = (s: string): string => s.trim().toLowerCase()
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const byName = <T extends { name: string }>(a: T, b: T): number => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

export class Model {
  series = new Map<number, MSeries>()
  affs = new Map<number, MAff>()
  chars = new Map<number, MChar>()
  groups = new Map<number, MGroup>()
  images: MImage[] = []
  bySha = new Map<string, MImage>()
  createdAt = 0
  roots: string[] = []
  private neg = -1 // ids of things made on the phone
  private seq = 1

  static fromPack(p: Pack, organizeDir: string, rootMap: Record<string, string>): Model {
    const m = new Model()
    m.createdAt = p.createdAt
    m.roots = p.roots ?? []
    const affKey = new Map<string, number>()
    const charKey = new Map<string, number>()
    const sids: number[] = []
    p.series.forEach((s, i) => {
      const sid = i + 1
      sids.push(sid)
      m.series.set(sid, { id: sid, name: s.name, aliases: s.aliases, tag: s.tag, wiki: s.wiki })
      for (const a of s.affiliations) affKey.set(a.key, m.idOf(a.key, 'a'))
      for (const a of s.affiliations)
        m.affs.set(affKey.get(a.key)!, {
          id: affKey.get(a.key)!,
          sid,
          name: a.name,
          aliases: a.aliases,
          parent: a.parent ? (affKey.get(a.parent) ?? null) : null,
          order: a.order
        })
      for (const c of s.characters) charKey.set(c.key, m.idOf(c.key, 'c'))
      for (const c of s.characters)
        m.chars.set(charKey.get(c.key)!, {
          id: charKey.get(c.key)!,
          key: c.key,
          name: c.name,
          aliases: c.aliases,
          tag: c.tag,
          sid,
          parent: c.parent ? (charKey.get(c.parent) ?? null) : null,
          aff: c.affiliation ? (affKey.get(c.affiliation) ?? null) : null
        })
    })
    const gid = new Map<string, number>()
    for (const g of p.groups ?? []) {
      const id = m.seq++
      gid.set(g.name, id)
      m.groups.set(id, { id, name: g.name, order: g.order })
    }
    const thumbs = joinPath(organizeDir, '.sorta/thumbs')
    ;(p.files ?? []).forEach((f, i) => {
      const base = f.r === undefined ? organizeDir : (rootMap[m.roots[f.r]] ?? '')
      const img: MImage = {
        id: i + 1,
        sha: f.sha,
        p: f.p,
        r: f.r,
        path: base ? joinPath(base, f.p) : '',
        thumb: `${thumbs}/${f.sha}.webp`,
        name: f.p.split('/').pop() ?? f.p,
        size: f.size,
        order: i,
        rating: f.rating as Rating,
        rs: f.rs,
        score: f.score,
        rr: f.rr,
        kind: f.kind,
        fav: f.fav,
        stars: f.stars,
        go: f.go,
        gs: f.gs === null ? null : (sids[f.gs] ?? null),
        aside: f.aside,
        classified: f.classified,
        rows: f.chars.map((c) => ({
          c: c.c ? (charKey.get(c.c) ?? null) : null,
          st: c.st as MatchStatus,
          src: c.src,
          conf: c.conf,
          cand: c.cand?.map((x) => ({ c: charKey.get(x.c) ?? 0, score: x.score })).filter((x) => x.c) ?? null
        })),
        groups: f.groups.map((n) => gid.get(n)).filter((x): x is number => x !== undefined)
      }
      m.images.push(img)
      if (!m.bySha.has(f.sha)) m.bySha.set(f.sha, img)
    })
    return m
  }

  // c12 → 12 (pack keys are the PC's ids); anything else gets a fresh id
  private idOf(key: string, prefix: string): number {
    const n = key.startsWith(prefix) ? Number(key.slice(1)) : NaN
    return Number.isInteger(n) && n > 0 ? n : this.neg--
  }

  // ---- names ↔ things ----

  seriesByName(name: string, create: boolean): MSeries | null {
    const t = lower(name)
    for (const s of this.series.values()) if ([s.name, ...s.aliases].some((x) => lower(x) === t)) return s
    if (!create || !t) return null
    const s: MSeries = { id: this.neg--, name: name.trim(), aliases: [], tag: null, wiki: null }
    this.series.set(s.id, s)
    return s
  }
  charRef(id: number): CharRef | null {
    const c = this.chars.get(id)
    if (!c) return null
    return { k: c.key, name: c.name, series: this.series.get(c.sid)?.name ?? '' }
  }
  resolveChar(r: CharRef, create: boolean): number | null {
    if (r.k) {
      for (const c of this.chars.values()) if (c.key === r.k && lower(c.name) === lower(r.name)) return c.id
    }
    const s = this.seriesByName(r.series || '작품 미상', create)
    if (s) for (const c of this.chars.values()) if (c.sid === s.id && [c.name, ...c.aliases].some((x) => lower(x) === lower(r.name))) return c.id
    if (!create || !s || !r.name.trim()) return null
    const c: MChar = { id: this.neg--, name: r.name.trim(), aliases: [], tag: null, sid: s.id, parent: null, aff: null }
    this.chars.set(c.id, c)
    return c.id
  }
  affByName(sid: number, name: string): MAff | null {
    const t = lower(name)
    for (const a of this.affs.values()) if (a.sid === sid && [a.name, ...a.aliases].some((x) => lower(x) === t)) return a
    return null
  }
  affPath(id: number | null): string[] {
    const out: string[] = []
    const seen = new Set<number>()
    for (let a = id === null ? undefined : this.affs.get(id); a && !seen.has(a.id); a = a.parent === null ? undefined : this.affs.get(a.parent)) {
      seen.add(a.id)
      out.unshift(a.name)
    }
    return out
  }
  // A character's 소속 (outfit versions follow their base character).
  charAff(c: MChar): number | null {
    return c.aff ?? (c.parent !== null ? (this.chars.get(c.parent)?.aff ?? null) : null)
  }
  groupByName(name: string, create: boolean): MGroup | null {
    for (const g of this.groups.values()) if (g.name === name) return g
    if (!create) return null
    const g: MGroup = { id: this.seq++, name, order: Math.max(-1, ...[...this.groups.values()].map((x) => x.order)) + 1 }
    this.groups.set(g.id, g)
    return g
  }

  // ---- a picture's whole state (what an 'image' edit carries) ----

  stateOf(img: MImage): MobileImageState {
    const ref = (id: number): CharRef => this.charRef(id) ?? { name: '', series: '' }
    return {
      chars: img.rows.map((r) => ({
        c: r.c === null ? null : ref(r.c),
        st: r.st,
        src: r.src,
        conf: r.conf,
        cand: r.cand?.map((x) => ({ c: ref(x.c), score: x.score })) ?? null
      })),
      kind: img.kind,
      go: img.go,
      gs: img.gs === null ? null : (this.series.get(img.gs)?.name ?? null),
      rating: { v: img.rating, src: img.rs, rr: img.rr },
      fav: img.fav,
      stars: img.stars,
      groups: img.groups.map((g) => this.groups.get(g)?.name).filter((x): x is string => !!x)
    }
  }

  // ---- edits (the same meaning as on the PC, desktop core/mobile.ts) ----

  apply(e: MobileEdit): void {
    switch (e.op) {
      case 'image': {
        const img = this.bySha.get(e.sha)
        if (!img) return
        const st = e.set
        if (st.chars)
          img.rows = st.chars.map((r) => ({
            c: r.c ? this.resolveChar(r.c, true) : null,
            st: r.st as MatchStatus,
            src: r.src,
            conf: r.conf,
            cand:
              r.cand
                ?.map((x) => ({ c: this.resolveChar(x.c, false) ?? 0, score: x.score }))
                .filter((x) => x.c) ?? null
          }))
        if (st.kind !== undefined) img.kind = st.kind
        if (st.go !== undefined) {
          img.go = st.go
          img.gs = st.go && st.gs ? (this.seriesByName(st.gs, true)?.id ?? null) : null
        }
        if (st.rating) {
          img.rating = st.rating.v as Rating
          img.rs = st.rating.src
          img.rr = st.rating.rr
        }
        if (st.fav !== undefined) img.fav = st.fav
        if (st.stars !== undefined) img.stars = st.stars
        if (st.groups) img.groups = st.groups.map((n) => this.groupByName(n, true)!.id)
        return
      }
      case 'place': {
        const id = this.resolveChar(e.char, false)
        const c = id === null ? undefined : this.chars.get(id)
        if (!c) return
        const aff = e.path?.length ? this.ensurePath(c.sid, e.path) : null
        for (const x of this.chars.values()) if (x.id === c.id || x.parent === c.id) x.aff = aff
        return
      }
      case 'addAff': {
        const s = this.seriesByName(e.series, false)
        if (s && e.path.length) this.ensurePath(s.id, e.path)
        return
      }
      case 'renameAff': {
        const s = this.seriesByName(e.series, false)
        const a = s ? this.affByName(s.id, e.name) : null
        if (!a || !e.to.trim()) return
        a.aliases = [...new Set([...a.aliases, a.name])].filter((x) => x !== e.to.trim())
        a.name = e.to.trim()
        return
      }
      case 'deleteAff': {
        const s = this.seriesByName(e.series, false)
        const a = s ? this.affByName(s.id, e.name) : null
        if (!a) return
        for (const x of this.affs.values()) if (x.parent === a.id) x.parent = a.parent
        for (const c of this.chars.values()) if (c.aff === a.id) c.aff = a.parent
        this.affs.delete(a.id)
        return
      }
      case 'renameChar': {
        const id = this.resolveChar(e.char, false)
        const c = id === null ? undefined : this.chars.get(id)
        if (c && e.to.trim()) c.name = e.to.trim()
        return
      }
      case 'group': {
        const g = this.groupByName(e.name, false)
        if (e.action === 'create') this.groupByName(e.name, true)
        else if (g && e.action === 'delete') {
          this.groups.delete(g.id)
          for (const i of this.images) i.groups = i.groups.filter((x) => x !== g.id)
        } else if (g && e.to) g.name = e.to
        return
      }
    }
  }

  // Found by name / alias anywhere in the game, else made under the previous level.
  private ensurePath(sid: number, path: string[]): number | null {
    let parent: number | null = null
    for (const raw of path) {
      const name = raw.trim()
      if (!name) continue
      const found = this.affByName(sid, name)
      if (found) parent = found.id
      else {
        const order = Math.max(-1, ...[...this.affs.values()].filter((a) => a.sid === sid && a.parent === parent).map((a) => a.order)) + 1
        const a: MAff = { id: this.neg--, sid, name, aliases: [], parent, order }
        this.affs.set(a.id, a)
        parent = a.id
      }
    }
    return parent
  }

  // ---- read side ----

  private visible(img: MImage, ratings: RatingPick[], groups: number[]): boolean {
    if (ratings.length < ALL_RATINGS.length && !ALL_RATINGS.filter((r) => ratings.includes(r)).includes(img.rating as RatingPick)) return false
    if (groups.length && !img.groups.some((g) => groups.includes(g))) return false
    return true
  }
  private root(id: number): number {
    return this.chars.get(id)?.parent ?? id
  }
  private isUnknown(i: MImage): boolean {
    return i.classified && i.kind !== 'other' && !i.go && !i.rows.some((r) => SORTED(r) || r.st === 'pending')
  }

  tree(ratings: RatingPick[] = ALL_RATINGS, groupFilter: number[] = []): LibraryTree {
    const filtered = ratings.length < ALL_RATINGS.length || groupFilter.length > 0
    type C = {
      own: Map<number, number>
      root: Map<number, number>
      series: Map<number, number>
      groupShots: Map<number, number>
      groups: Map<number, number>
      aff: Map<number, number>
      counts: TreeCounts
    }
    const count = (pass: (i: MImage) => boolean): C => {
      const own = new Map<number, Set<number>>()
      const root = new Map<number, Set<number>>()
      const series = new Map<number, Set<number>>()
      const aff = new Map<number, Set<number>>()
      const groupShots = new Map<number, number>()
      const groups = new Map<number, number>()
      const add = (m: Map<number, Set<number>>, k: number, id: number): void => {
        let s = m.get(k)
        if (!s) m.set(k, (s = new Set()))
        s.add(id)
      }
      const counts: TreeCounts = { all: 0, favorite: 0, pending: 0, ratingReview: 0, unknown: 0, other: 0, groupShot: 0, unclassified: 0, setAside: 0 }
      for (const i of this.images) {
        if (!pass(i)) continue
        if (i.aside) {
          counts.setAside++
          continue
        }
        counts.all++
        if (i.fav) counts.favorite++
        if (i.rows.some((r) => r.st === 'pending')) counts.pending++
        if (i.rr) counts.ratingReview++
        if (this.isUnknown(i)) counts.unknown++
        if (i.kind === 'other') counts.other++
        if (i.go) counts.groupShot++
        if (!i.classified) counts.unclassified++
        for (const g of i.groups) groups.set(g, (groups.get(g) ?? 0) + 1)
        for (const r of i.rows) {
          if (!SORTED(r) || r.c === null) continue
          const c = this.chars.get(r.c)
          if (!c) continue
          add(own, c.id, i.id)
          add(root, this.root(c.id), i.id)
          add(series, c.sid, i.id)
          const seen = new Set<number>()
          for (let a = this.charAff(c); a !== null && !seen.has(a); a = this.affs.get(a)?.parent ?? null) {
            seen.add(a)
            add(aff, a, i.id)
          }
        }
        if (i.go && i.gs !== null) {
          add(series, i.gs, i.id)
          groupShots.set(i.gs, (groupShots.get(i.gs) ?? 0) + 1)
        }
      }
      const size = (m: Map<number, Set<number>>): Map<number, number> => new Map([...m].map(([k, v]) => [k, v.size]))
      return { own: size(own), root: size(root), series: size(series), aff: size(aff), groupShots, groups, counts }
    }
    const all = count(() => true)
    const f = filtered ? count((i) => this.visible(i, ratings, groupFilter)) : null
    const shown = (m: Exclude<keyof C, 'counts'>, k: number): number | undefined => (f ? (f[m].get(k) ?? 0) : undefined)

    const seriesMap = new Map<number, LibraryTree['series'][number]>()
    const nodes = new Map<number, TreeCharacter>()
    const getSeries = (sid: number): LibraryTree['series'][number] => {
      let s = seriesMap.get(sid)
      if (!s) {
        s = { id: sid, name: this.series.get(sid)?.name ?? '', count: all.series.get(sid) ?? 0, shown: shown('series', sid), affiliations: [], characters: [] }
        seriesMap.set(sid, s)
      }
      return s
    }
    for (const c of this.chars.values()) {
      if (c.parent !== null && this.chars.has(c.parent)) continue
      const n = all.root.get(c.id) ?? 0
      if (!n) continue
      const node: TreeCharacter = { id: c.id, name: c.name, tag: c.tag, count: n, shown: shown('root', c.id), children: [] }
      nodes.set(c.id, node)
      getSeries(c.sid).characters.push(node)
    }
    for (const c of this.chars.values()) {
      const n = all.own.get(c.id) ?? 0
      if (c.parent === null || !n) continue
      nodes.get(c.parent)?.children!.push({ id: c.id, name: c.name, tag: c.tag, count: n, shown: shown('own', c.id) })
    }
    for (const [sid, n] of all.groupShots) {
      if (!n) continue
      const s = getSeries(sid)
      s.groupShots = n
      s.groupShotsShown = f ? (f.groupShots.get(sid) ?? 0) : undefined
    }
    const series = [...seriesMap.values()].sort(byName)
    for (const s of series) {
      s.characters.sort(byName)
      for (const c of s.characters) c.children?.sort(byName)
    }
    const affRows = [...this.affs.values()].sort((a, b) => a.order - b.order || a.id - b.id)
    const affNodes = new Map<number, TreeAffiliation>()
    for (const a of affRows) {
      const n = all.aff.get(a.id) ?? 0
      if (n) affNodes.set(a.id, { id: a.id, name: a.name, count: n, shown: shown('aff', a.id), children: [], characters: [] })
    }
    for (const a of affRows) {
      const node = affNodes.get(a.id)
      if (!node) continue
      const up = a.parent !== null ? affNodes.get(a.parent) : undefined
      if (up) up.children.push(node)
      else seriesMap.get(a.sid)?.affiliations.push(node)
    }
    for (const s of series) {
      s.characters = s.characters.filter((c) => {
        const ch = this.chars.get(c.id)
        const a = ch ? this.charAff(ch) : null
        const node = a !== null ? affNodes.get(a) : undefined
        if (!node) return true
        node.characters.push(c)
        return false
      })
    }
    const groups = [...this.groups.values()]
      .sort((a, b) => a.order - b.order || a.id - b.id)
      .map((g) => ({ id: g.id, name: g.name, count: all.groups.get(g.id) ?? 0, shown: f ? (f.groups.get(g.id) ?? 0) : undefined }))
    return { series, groups, counts: all.counts, shown: f?.counts, dups: null, ignored: [] }
  }

  private item(i: MImage): ImageItem {
    return {
      id: i.id,
      path: i.path,
      thumb: i.thumb,
      width: null,
      height: null,
      rating: i.rating,
      ratingReview: !!i.rr,
      kind: (i.go ? 'group' : i.kind) as ImageItem['kind'],
      groupSeries: i.gs === null ? null : (this.series.get(i.gs)?.name ?? null),
      dupOf: null,
      error: null,
      name: i.name,
      fileSize: i.size,
      mtime: null,
      importedAt: i.order,
      favorite: !!i.fav,
      stars: i.stars,
      groups: i.groups,
      characters: i.rows.map((r) => {
        const c = r.c === null ? undefined : this.chars.get(r.c)
        return {
          id: c?.id ?? null,
          name: c?.name ?? null,
          series: c ? (this.series.get(c.sid)?.name ?? null) : null,
          tag: c?.tag ?? null,
          status: r.st,
          confidence: r.conf
        }
      })
    }
  }
  itemById(id: number): ImageItem | null {
    const i = this.images[id - 1]
    return i ? this.item(i) : null
  }

  images_(f: LibraryFilter): ImageItem[] {
    const n = f.node
    const sorted = (i: MImage, pass: (c: MChar) => boolean): boolean =>
      i.rows.some((r) => {
        if (!SORTED(r) || r.c === null) return false
        const c = this.chars.get(r.c)
        return !!c && pass(c)
      })
    const subAffs = (id: number): Set<number> => {
      const out = new Set([id])
      for (let grew = true; grew; ) {
        grew = false
        for (const a of this.affs.values()) if (a.parent !== null && out.has(a.parent) && !out.has(a.id)) (out.add(a.id), (grew = true))
      }
      return out
    }
    const affSet = n.type === 'affiliation' ? subAffs(n.id) : null
    const q = f.q.trim().toLowerCase()
    const matchQ = (i: MImage): boolean => {
      if (i.p.toLowerCase().includes(q)) return true
      return i.rows.some((r) => {
        const c = r.c === null ? undefined : this.chars.get(r.c)
        if (!c) return false
        const s = this.series.get(c.sid)
        return [c.name, ...c.aliases, s?.name ?? '', ...(s?.aliases ?? [])].some((x) => x.toLowerCase().includes(q))
      })
    }
    const pass = (i: MImage): boolean => {
      if (n.type === 'setAside' ? !i.aside : i.aside) return false
      switch (n.type) {
        case 'series':
          if (!(sorted(i, (c) => c.sid === n.id) || (i.go && i.gs === n.id))) return false
          break
        case 'character':
          if (!sorted(i, (c) => c.id === n.id || c.parent === n.id)) return false
          break
        case 'affiliation':
          if (!sorted(i, (c) => affSet!.has(this.charAff(c) ?? 0))) return false
          break
        case 'favorite':
          if (!i.fav) return false
          break
        case 'group':
          if (!i.groups.includes(n.id)) return false
          break
        case 'pending':
          if (!i.rows.some((r) => r.st === 'pending')) return false
          break
        case 'ratingReview':
          if (!i.rr) return false
          break
        case 'unknown':
          if (!this.isUnknown(i)) return false
          break
        case 'other':
          if (i.kind !== 'other') return false
          break
        case 'groupShot':
          if (!i.go || (n.id !== undefined && i.gs !== n.id)) return false
          break
        case 'unclassified':
          if (i.classified) return false
          break
      }
      if (f.favOnly && !i.fav) return false
      if (!this.visible(i, f.ratings, f.groups ?? [])) return false
      return !q || matchQ(i)
    }
    return sortItems(this.images.filter(pass).map((i) => this.item(i)), f)
  }

  // ---- review ----

  reviewQueue(kind: ReviewKind, lowConfidence = 0.5): ReviewItem[] {
    const out: ReviewItem[] = []
    for (const i of this.images) {
      if (i.aside) continue
      if (kind === 'character' ? !i.rows.some((r) => r.st === 'pending') : !i.rr) continue
      const confirmed = i.rows
        .filter((r) => SORTED(r) && r.c !== null && this.chars.has(r.c))
        .map((r) => {
          const c = this.chars.get(r.c!)!
          return { id: c.id, name: c.name, series: this.series.get(c.sid)?.name ?? '' }
        })
      const cands: ReviewCandidate[] = []
      for (const r of i.rows.filter((x) => x.st === 'pending')) {
        for (const x of r.cand ?? []) {
          if (cands.some((k) => k.id === x.c)) continue
          const c = this.chars.get(x.c)
          if (!c) continue
          const rel = confirmed.find((k) => k.id !== x.c && this.root(k.id) === this.root(x.c))
          cands.push({
            relatedTo: rel ? { id: rel.id, name: rel.name } : undefined,
            id: c.id,
            name: c.name,
            series: this.series.get(c.sid)?.name ?? '',
            score: x.score,
            low: x.score < lowConfidence,
            refs: this.references(c.id, i.id)
          })
        }
      }
      out.push({
        id: i.id,
        path: i.path,
        thumb: i.thumb,
        width: null,
        height: null,
        rating: i.rating,
        ratingScore: i.score,
        confirmed,
        candidates: cands
      })
    }
    return out
  }

  // Up to n 미리 보기 of pictures already under the character (confirmed first).
  private references(cid: number, except: number, n = 4): string[] {
    const hits: { t: string; conf: boolean; id: number }[] = []
    for (const i of this.images) {
      if (i.id === except) continue
      const r = i.rows.find((x) => x.c === cid && SORTED(x))
      if (r) hits.push({ t: `${i.thumb}\n${i.path}`, conf: r.st === 'confirmed', id: i.id })
    }
    return hits
      .sort((a, b) => Number(b.conf) - Number(a.conf) || b.id - a.id)
      .slice(0, n)
      .map((h) => h.t)
  }

  searchCharacters(q: string, limit = 12): CharacterHit[] {
    const t = q.trim().toLowerCase()
    if (!t) return []
    const words = t.split(/\s+/)
    const n = new Map<number, number>()
    for (const i of this.images) for (const r of i.rows) if (SORTED(r) && r.c !== null) n.set(r.c, (n.get(r.c) ?? 0) + 1)
    const hits: (CharacterHit & { prefix: boolean })[] = []
    for (const c of this.chars.values()) {
      const s = this.series.get(c.sid)?.name ?? ''
      const hay = [c.name, ...c.aliases.map((a) => a.replace(/_/g, ' ')), s].map((x) => x.toLowerCase())
      if (!words.every((w) => hay.some((h) => h.includes(w)))) continue
      hits.push({ id: c.id, name: c.name, series: s, n: n.get(c.id) ?? 0, prefix: c.name.toLowerCase().startsWith(t) })
    }
    return hits
      .sort((a, b) => Number(b.prefix) - Number(a.prefix) || b.n - a.n || collator.compare(a.name, b.name))
      .slice(0, limit)
      .map(({ prefix: _p, ...h }) => h)
  }

  seriesNames(): string[] {
    return [...this.series.values()].map((s) => s.name).sort((a, b) => collator.compare(a, b))
  }

  // ---- 관리 ----

  characters(): ManagedCharacter[] {
    const n = new Map<number, number>()
    for (const i of this.images) for (const r of i.rows) if (SORTED(r) && r.c !== null) n.set(r.c, (n.get(r.c) ?? 0) + 1)
    return [...this.chars.values()]
      .map((c) => ({
        id: c.id,
        name: c.name,
        aliases: c.aliases,
        tag: c.tag,
        parentId: c.parent,
        seriesId: c.sid,
        series: this.series.get(c.sid)?.name ?? '',
        affiliation: c.aff === null ? null : (this.affs.get(c.aff)?.name ?? null),
        images: n.get(c.id) ?? 0,
        refs: 0
      }))
      .sort((a, b) => collator.compare(a.series, b.series) || collator.compare(a.name, b.name))
  }

  orgChart(series: string): OrgChart {
    const s = this.seriesByName(series, false)
    if (!s) return { series, wiki: null, nodes: [], characters: [] }
    const n = new Map<number, number>()
    for (const i of this.images) for (const r of i.rows) if (SORTED(r) && r.c !== null) n.set(this.root(r.c), (n.get(this.root(r.c)) ?? 0) + 1)
    return {
      series: s.name,
      wiki: s.wiki,
      nodes: [...this.affs.values()]
        .filter((a) => a.sid === s.id)
        .map((a) => ({ id: a.id, name: a.name, aliases: a.aliases, parentId: a.parent, order: a.order })),
      characters: [...this.chars.values()]
        .filter((c) => c.sid === s.id && c.parent === null)
        .map((c) => ({ id: c.id, name: c.name, affiliationId: c.aff, images: n.get(c.id) ?? 0 }))
        .sort(byName)
    }
  }
}

export function sortItems(items: ImageItem[], f: Pick<LibraryFilter, 'sort' | 'dir' | 'seed'>): ImageItem[] {
  const name = (a: ImageItem, b: ImageItem): number => collator.compare(a.name, b.name)
  if (f.sort === 'random') {
    const seed = f.seed ?? 0
    const h = (id: number): number => {
      let x = (id ^ seed) >>> 0
      x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
      x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
      return (x ^ (x >>> 16)) >>> 0
    }
    return items.sort((a, b) => h(a.id) - h(b.id))
  }
  const ext = (n: string): string => (n.includes('.') ? n.slice(n.lastIndexOf('.') + 1).toLowerCase() : '')
  const cmp: Record<Exclude<LibraryFilter['sort'], 'random'>, (a: ImageItem, b: ImageItem) => number> = {
    name,
    date: (a, b) => a.importedAt - b.importedAt || name(a, b),
    type: (a, b) => collator.compare(ext(a.name), ext(b.name)) || name(a, b),
    size: (a, b) => (a.fileSize ?? 0) - (b.fileSize ?? 0) || name(a, b),
    stars: (a, b) => a.stars - b.stars || name(a, b)
  }
  const s = f.dir === 'asc' ? 1 : -1
  const by = cmp[f.sort as Exclude<LibraryFilter['sort'], 'random'>]
  return items.sort((a, b) => s * by(a, b))
}
