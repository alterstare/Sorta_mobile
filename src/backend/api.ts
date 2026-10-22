// window.api: the library from the NAS (model.ts + edits.ts), the NAS
// connections and 올리기. Installed once before the screens mount.
import type { Api, JobSummary, LibStatus } from '../shared/ipc'
import type { MobileEdit } from '../shared/mobile'
import { PACK_FORMAT, PACK_VERSION } from '../shared/pack'
import type { Pack } from '../shared/pack'
import type { Rating, Settings } from '../shared/types'
import { SystemBars, SystemBarsStyle } from '@capacitor/core'
import { Model } from './model'
import type { MImage } from './model'
import { Edits } from './edits'
import { cancelJob, emitChanged, emitToast, job, on } from './bus'
import { imgUrl, isNas, joinPath, localThumbUrl, native, rawUrl, thumbUrl } from './native'
import { loadSettings, saveSettings } from './settings'
import { deleteUploaded, uploadAll, uploadList } from './upload'

let model = new Model()
let edits: Edits | null = null
let status: LibStatus = { state: 'setup' }
const statusSubs = new Set<(s: LibStatus) => void>()
const setStatus = (s: LibStatus): void => {
  status = s
  statusSubs.forEach((f) => f(s))
}

const libFile = (dir: string): string => joinPath(dir, '.sorta/library.sortapack')

// gzip JSON straight from the NAS (served by the native side, no cache).
async function readPack(dir: string): Promise<Pack> {
  const res = await fetch(rawUrl(libFile(dir)))
  if (res.status === 404) throw new Error('정리 폴더에 분류 정보 파일이 없습니다. PC의 Sorta 설정에서 "분류 정보 파일"을 켜고 정리 폴더를 확인하세요')
  if (!res.ok || !res.body) throw new Error(`분류 정보 파일을 읽지 못했습니다 (HTTP ${res.status})`)
  const text = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).text()
  const p = JSON.parse(text) as Pack
  if (p.format !== PACK_FORMAT) throw new Error('Sorta 분류 정보 파일이 아닙니다')
  if (p.version > PACK_VERSION) throw new Error('더 새 버전의 Sorta에서 만든 파일입니다. Sorta 모바일을 업데이트하세요')
  return p
}

let loading: Promise<void> | null = null
async function reload(): Promise<void> {
  if (loading) return loading
  loading = (async () => {
    const s = loadSettings()
    if (!s.nasId || !s.organizeDir) {
      setStatus({ state: 'setup' })
      return
    }
    if (status.state !== 'ready') setStatus({ state: 'loading' })
    try {
      await edits?.flush() // what's waiting goes out before the file is read again
      const p = await job('분류 정보 불러오기', async () => readPack(s.organizeDir))
      const m = Model.fromPack(p, s.organizeDir, s.roots)
      const e = new Edits(m, Edits.dirOf(s.organizeDir), s.deviceId)
      e.onChange = emitChanged
      e.onError = (message) => emitToast({ ok: false, message })
      await e.restore()
      model = m
      edits = e
      setStatus({ state: 'ready', createdAt: p.createdAt, app: p.app, files: m.images.length, roots: m.roots })
      emitChanged()
    } catch (e) {
      const message = String((e as Error)?.message ?? e)
      if (status.state === 'ready') emitToast({ ok: false, message })
      else setStatus({ state: 'error', message })
    }
  })()
  try {
    await loading
  } finally {
    loading = null
  }
}

const need = (): Edits => {
  if (!edits) throw new Error('NAS의 분류 정보를 아직 불러오지 않았습니다')
  return edits
}
const imgs = (ids: number[]): MImage[] => [...new Set(ids)].map((id) => model.images[id - 1]).filter((x): x is MImage => !!x)

// One step over pictures: `fn` changes copies; before / after become 'image' edits.
function change(label: string, ids: number[], fn: (img: MImage) => void): void {
  const e = need()
  const list = imgs(ids)
  const at = Date.now()
  const before: MobileEdit[] = list.map((i) => ({ op: 'image', at, sha: i.sha, label: `되돌리기: ${label}`, set: model.stateOf(i) }))
  const after: MobileEdit[] = list.map((i) => {
    const c: MImage = { ...i, rows: i.rows.map((r) => ({ ...r })), groups: [...i.groups] }
    fn(c)
    return { op: 'image', at, sha: i.sha, label, set: model.stateOf(c) }
  })
  e.record(label, before, after)
}

const confirmedRows = (ids: number[]): MImage['rows'] => [...new Set(ids)].map((c) => ({ c, st: 'confirmed', src: 'user', conf: 1, cand: null }))

const api: Api = {
  status: () => status,
  onStatus: (cb) => {
    statusSubs.add(cb)
    return () => statusSubs.delete(cb)
  },
  reload,
  onProgress: (cb) => on('progress', cb),
  onToast: (cb) => on('toast', cb),
  onLibraryChanged: (cb) => on('changed', cb),
  cancelJob: async (id) => cancelJob(id),
  getSettings: async () => loadSettings(),
  saveSettings: async (patch: Partial<Settings>) => {
    const before = loadSettings()
    const s = saveSettings(patch)
    if (patch.theme) applyTheme(patch.theme)
    if (patch.cacheMB !== undefined) void native.setCacheLimit({ bytes: patch.cacheMB * 1048576 }).catch(() => {})
    const moved = (patch.organizeDir !== undefined && patch.organizeDir !== before.organizeDir) || (patch.nasId !== undefined && patch.nasId !== before.nasId)
    if (moved) {
      await edits?.flush()
      Edits.clear()
      edits = null
      model = new Model()
      setStatus({ state: 'setup' })
    }
    if (moved || (patch.roots && JSON.stringify(patch.roots) !== JSON.stringify(before.roots))) void reload()
    return s
  },
  appVersion: async () => (await native.appInfo()).version,

  tree: async (ratings, groups) => model.tree(ratings, groups),
  images: async (f) => model.images_(f),
  imageUrl: (p) => {
    const nl = p.indexOf('\n')
    if (nl >= 0) return thumbUrl(p.slice(0, nl), p.slice(nl + 1))
    return p ? imgUrl(p) : ''
  },
  thumbUrl: (t, p) => thumbUrl(t, p),
  setFavorite: async (ids, on) => change(on ? '즐겨찾기' : '즐겨찾기 해제', ids, (i) => (i.fav = on ? 1 : 0)),
  setStars: async (ids, stars) => change('평점', ids, (i) => (i.stars = stars)),
  groups: async () => [...model.groups.values()].sort((a, b) => a.order - b.order).map((g) => ({ id: g.id, name: g.name })),
  createGroup: async (name, ids = []) => {
    const e = need()
    const n = name.trim()
    if (!n) throw new Error('그룹 이름이 비어 있습니다')
    if (model.groupByName(n, false)) throw new Error(`"${n}" 그룹이 이미 있습니다`)
    const at = Date.now()
    e.record(`그룹 "${n}" 만들기`, [{ op: 'group', at, action: 'delete', name: n }], [{ op: 'group', at, action: 'create', name: n }])
    const g = model.groupByName(n, false)!
    if (ids.length) change(`그룹 "${n}"에 추가`, ids, (i) => (i.groups = [...new Set([...i.groups, g.id])]))
    return g.id
  },
  renameGroup: async (id, name) => {
    const g = model.groups.get(id)
    const n = name.trim()
    if (!g || !n || n === g.name) return
    if (model.groupByName(n, false)) throw new Error(`"${n}" 그룹이 이미 있습니다`)
    const at = Date.now()
    need().record('그룹 이름 변경', [{ op: 'group', at, action: 'rename', name: n, to: g.name }], [{ op: 'group', at, action: 'rename', name: g.name, to: n }])
  },
  deleteGroup: async (id) => {
    const g = model.groups.get(id)
    if (!g) return
    const members = model.images.filter((i) => i.groups.includes(id))
    const at = Date.now()
    const back: MobileEdit[] = [
      { op: 'group', at, action: 'create', name: g.name },
      ...members.map((i): MobileEdit => ({ op: 'image', at, sha: i.sha, label: '되돌리기: 그룹 삭제', set: { groups: model.stateOf(i).groups } }))
    ]
    need().record(`그룹 "${g.name}" 삭제`, back, [{ op: 'group', at, action: 'delete', name: g.name }])
  },
  setGroupMembership: async (ids, groupId, on) => {
    const g = model.groups.get(groupId)
    if (!g) throw new Error('그룹이 없습니다')
    change(on ? `그룹 "${g.name}"에 추가` : `그룹 "${g.name}"에서 빼기`, ids, (i) => {
      i.groups = on ? [...new Set([...i.groups, groupId])] : i.groups.filter((x) => x !== groupId)
    })
  },

  reviewQueue: async (kind) => model.reviewQueue(kind),
  confirmCharacters: async (imageIds, characterIds) =>
    change('캐릭터 확정', imageIds, (i) => {
      i.rows = confirmedRows(characterIds)
      i.kind = 'character'
      i.go = 0
      i.gs = null
    }),
  addCharacter: async (imageId, characterId) =>
    change('캐릭터 추가', [imageId], (i) => {
      i.rows = [...i.rows.filter((r) => r.st !== 'pending' && r.st !== 'unknown' && r.c !== characterId), ...confirmedRows([characterId])]
      i.kind = 'character'
      i.go = 0
      i.gs = null
    }),
  markOther: async (imageIds) =>
    change('캐릭터 아닌 그림으로 지정', imageIds, (i) => {
      i.rows = []
      i.kind = 'other'
      i.go = 0
      i.gs = null
    }),
  markGroup: async (imageIds, series) => {
    const name = series?.trim() || null
    const sid = name ? model.seriesByName(name, true)!.id : null
    change(name ? `단체 사진으로 분류 (${name})` : '단체 사진으로 분류', imageIds, (i) => {
      i.rows = []
      i.kind = 'character'
      i.go = 1
      i.gs = sid
    })
  },
  setRating: async (imageIds, rating) =>
    change('등급 변경', imageIds, (i) => {
      i.rating = rating
      i.rs = 'user'
      i.rr = 0
    }),
  decide: async (imageId, characterIds, rating) =>
    change('캐릭터 확정', [imageId], (i) => {
      i.rows = confirmedRows(characterIds)
      i.kind = 'character'
      i.go = 0
      i.gs = null
      if (rating && rating !== i.rating) {
        i.rating = rating as Rating
        i.rs = 'user'
        i.rr = 0
      }
    }),
  // Made on the phone; the PC creates it when the change arrives.
  createCharacter: async (name, series) => {
    const n = name.trim()
    if (!n) throw new Error('캐릭터 이름이 비어 있습니다')
    return model.resolveChar({ name: n, series: series.trim() || '작품 미상' }, true)!
  },
  searchCharacters: async (q) => model.searchCharacters(q),
  characterFromTag: async () => {
    throw new Error('모델이 아는 캐릭터는 PC에서만 고를 수 있습니다')
  },
  seriesNames: async () => model.seriesNames(),
  undo: async () => ({ ok: true, label: edits?.undo() ?? null }),
  redo: async () => ({ ok: true, label: edits?.redo() ?? null }),
  canUndo: () => !!edits?.canUndo(),
  canRedo: () => !!edits?.canRedo(),
  characters: async () => model.characters(),
  renameCharacter: async (id, name) => {
    const ref = model.charRef(id)
    const n = name.trim()
    if (!ref || !n || n === ref.name) return
    const c = model.chars.get(id)!
    if ([...model.chars.values()].some((x) => x.sid === c.sid && x.id !== id && x.name === n)) throw new Error(`같은 게임에 "${n}"이(가) 이미 있습니다`)
    const at = Date.now()
    need().record('이름 변경', [{ op: 'renameChar', at, char: { ...ref, name: n }, to: ref.name }], [{ op: 'renameChar', at, char: ref, to: n }])
  },
  orgChart: async (series) => model.orgChart(series),
  addAffiliation: async (series, name, parentId) => {
    const n = name.trim()
    const s = model.seriesByName(series, false)
    if (!n || !s) throw new Error('이름이 비어 있습니다')
    if (model.affByName(s.id, n)) throw new Error(`"${n}" 소속이 이미 있습니다`)
    const path = [...model.affPath(parentId), n]
    const at = Date.now()
    need().record('소속 추가', [{ op: 'deleteAff', at, series: s.name, name: n }], [{ op: 'addAff', at, series: s.name, path }])
    return model.affByName(s.id, n)!.id
  },
  renameAffiliation: async (id, name) => {
    const a = model.affs.get(id)
    const n = name.trim()
    if (!a || !n || n === a.name) return
    if (model.affByName(a.sid, n)) throw new Error(`"${n}" 소속이 이미 있습니다`)
    const series = model.series.get(a.sid)!.name
    const at = Date.now()
    need().record('소속 이름 변경', [{ op: 'renameAff', at, series, name: n, to: a.name }], [{ op: 'renameAff', at, series, name: a.name, to: n }])
  },
  placeCharacters: async (ids, affiliationId) => {
    const at = Date.now()
    const before: MobileEdit[] = []
    const after: MobileEdit[] = []
    const path = affiliationId === null ? null : model.affPath(affiliationId)
    for (const id of ids) {
      const c = model.chars.get(id)
      const ref = model.charRef(id)
      if (!c || !ref) continue
      before.push({ op: 'place', at, char: ref, path: c.aff === null ? null : model.affPath(c.aff) })
      after.push({ op: 'place', at, char: ref, path })
    }
    need().record('소속 지정', before, after)
  },
  pendingEdits: () => edits?.waiting ?? 0,

  nasList: async () => (await native.nasList()).conns,
  nasTest: async (conn, password) => (await native.nasTest({ conn, password })).count,
  nasSave: async (conn, password) => (await native.nasSave({ conn, password })).id,
  nasRemove: async (id) => native.nasRemove({ id }),
  listDirs: async (path) =>
    (await native.fsReaddir({ path })).entries
      .filter((e) => e.isDir && !e.name.startsWith('.') && !e.name.startsWith('#') && !e.name.startsWith('@'))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),

  pickFolder: async () => (await native.pickFolder()).path,
  uploadList,
  uploadAll: async (): Promise<JobSummary> => {
    try {
      return await uploadAll()
    } catch (e) {
      return { ok: false, message: String((e as Error)?.message ?? e) }
    }
  },
  deleteUploaded: async (): Promise<JobSummary> => {
    try {
      return await deleteUploaded()
    } catch (e) {
      return { ok: false, message: String((e as Error)?.message ?? e) }
    }
  },
  localThumbUrl,

  cacheInfo: () => native.cacheInfo(),
  clearCache: () => native.clearCache(),
  exit: () => {
    void (edits?.flush() ?? Promise.resolve()).finally(() => void native.exitApp())
  }
}

// System bars follow the app's theme: Capacitor's SystemBars sets the icon
// style (and repaints the window background), then ours paints the bars' area.
function applyTheme(t: Settings['theme']): void {
  void SystemBars.setStyle({ style: t === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light })
    .catch(() => {})
    .finally(() => void native.setTheme({ dark: t === 'dark' }).catch(() => {}))
}

export function installBackend(): void {
  window.api = api
  const s = loadSettings()
  applyTheme(s.theme)
  void native.setCacheLimit({ bytes: s.cacheMB * 1048576 }).catch(() => {})
  // Leaving the app: what's waiting goes to the NAS; coming back: the PC may
  // have sorted since.
  void native.addListener('pause', () => void edits?.flush()).catch(() => {})
  void native.addListener('resume', () => void reload()).catch(() => {})
  void reload()
}

export { isNas }
