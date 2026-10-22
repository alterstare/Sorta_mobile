import { create } from 'zustand'
import type { JobSummary, LibStatus } from '../../shared/ipc'
import type { ImageItem, LibraryFilter, LibraryNode, LibraryTree, ProgressEvent, RatingPick, ReviewKind, Settings, SortDir, SortKey } from '../../shared/types'

export type View = 'library' | 'review' | 'manage' | 'settings' | 'upload'
export type ThumbSize = 's' | 'm' | 'l'
export type CharTab = 'manage' | 'org'

// A finished job stays on the activity list until cleared (Halftone's bar).
export type Job = ProgressEvent & { endedAt?: number }

interface State {
  view: View
  setView: (v: View) => void
  status: LibStatus
  settings: Settings | null
  jobs: Record<number, Job>
  activityOpen: boolean
  toggleActivity: () => void
  clearDoneJobs: () => void
  toast: JobSummary | null
  menuOpen: boolean
  setMenuOpen: (v: boolean) => void
  reviewKind: ReviewKind
  openReview: (k: ReviewKind) => void
  // library
  tree: LibraryTree | null
  filter: LibraryFilter
  images: ImageItem[]
  viewerIndex: number | null
  libraryVersion: number
  imagesKey: string
  selected: Set<number>
  selecting: boolean // long-press started a selection
  setSelected: (s: Set<number>) => void
  setSelecting: (v: boolean) => void
  kept: Record<string, unknown>
  groupDialog: number[] | null
  groupShotDialog: { ids: number[]; suggest: string | null; after?: () => void } | null
  setGroupShotDialog: (d: { ids: number[]; suggest: string | null; after?: () => void } | null) => void
  setGroupDialog: (ids: number[] | null) => void
  renameGroup: { id: number; name: string } | null
  setRenameGroup: (g: { id: number; name: string } | null) => void
  charTab: CharTab
  setCharTab: (t: CharTab) => void
  undo: () => Promise<void>
  redo: () => Promise<void>
  load: () => Promise<void>
  saveSettings: (patch: Partial<Settings>) => Promise<void>
  onProgress: (e: ProgressEvent) => void
  showToast: (t: JobSummary) => void
  dismissToast: () => void
  refreshLibrary: () => Promise<void>
  setNode: (n: LibraryNode) => void
  setRatings: (r: RatingPick[], prev?: RatingPick[] | null) => void
  setSort: (k: SortKey) => void
  setGroupFilter: (ids: number[]) => void
  setFavOnly: (on: boolean) => void
  reshuffle: () => void
  setDir: (d: SortDir) => void
  setQuery: (q: string) => void
  openViewer: (i: number | null) => void
  goToNode: (node: LibraryNode) => void
  treeReveal: { node: LibraryNode; n: number } | null
}

let librarySeq = 0
let toastTimer: ReturnType<typeof setTimeout> | null = null

export const useStore = create<State>((set, get) => ({
  view: 'library',
  setView: (view) => set({ view, menuOpen: false, viewerIndex: null }),
  status: { state: 'loading' },
  settings: null,
  jobs: {},
  activityOpen: false,
  toggleActivity: () => set({ activityOpen: !get().activityOpen }),
  clearDoneJobs: () =>
    set((s) => ({ jobs: Object.fromEntries(Object.entries(s.jobs).filter(([, j]) => j.state === 'running' || j.state === 'queued')) })),
  toast: null,
  menuOpen: false,
  setMenuOpen: (menuOpen) => set({ menuOpen }),
  reviewKind: 'character',
  openReview: (reviewKind) => set({ reviewKind, view: 'review', menuOpen: false, viewerIndex: null }),
  tree: null,
  filter: { node: { type: 'all' }, ratings: ['general', 'sensitive', 'r18'], q: '', sort: 'date', dir: 'desc', seed: Date.now() % 2147483647 },
  images: [],
  viewerIndex: null,
  libraryVersion: 0,
  imagesKey: '',
  selected: new Set(),
  selecting: false,
  setSelected: (selected) => set({ selected, selecting: selected.size > 0 ? get().selecting : false }),
  setSelecting: (selecting) => set(selecting ? { selecting } : { selecting, selected: new Set() }),
  kept: {},
  groupDialog: null,
  groupShotDialog: null,
  setGroupShotDialog: (groupShotDialog) => set({ groupShotDialog }),
  setGroupDialog: (groupDialog) => set({ groupDialog }),
  renameGroup: null,
  setRenameGroup: (renameGroup) => set({ renameGroup }),
  charTab: 'manage',
  setCharTab: (charTab) => set({ charTab }),
  undo: async () => {
    const r = await window.api.undo()
    get().showToast({ ok: true, message: r.label ? `되돌리기 완료: ${r.label}` : '되돌릴 작업이 없습니다.' })
  },
  redo: async () => {
    const r = await window.api.redo()
    get().showToast({ ok: true, message: r.label ? `다시 실행 완료: ${r.label}` : '다시 실행할 작업이 없습니다.' })
  },
  load: async () => {
    const settings = await window.api.getSettings()
    set({
      settings,
      status: window.api.status(),
      filter: { ...get().filter, ratings: settings.libRatings, groups: settings.libGroups, favOnly: settings.libFavOnly, sort: settings.libSort, dir: settings.libDir }
    })
    await get().refreshLibrary()
  },
  saveSettings: async (patch) => set({ settings: await window.api.saveSettings(patch) }),
  onProgress: (e) =>
    set((s) => {
      const jobs = { ...s.jobs }
      jobs[e.jobId] = e.state === 'running' || e.state === 'queued' ? e : { ...e, endedAt: Date.now() }
      if (e.state === 'done' || e.state === 'cancelled')
        setTimeout(() => {
          if (get().activityOpen) return
          set((s2) => {
            const j = { ...s2.jobs }
            if (j[e.jobId]?.state === e.state) delete j[e.jobId]
            return { jobs: j }
          })
        }, 4000)
      return { jobs }
    }),
  showToast: (toast) => {
    if (toastTimer) clearTimeout(toastTimer)
    set({ toast })
    toastTimer = setTimeout(() => set({ toast: null }), 3500)
  },
  dismissToast: () => set({ toast: null }),
  refreshLibrary: async () => {
    const f = get().filter
    const seq = ++librarySeq
    const [tree, images] = await Promise.all([window.api.tree(f.ratings, f.groups), window.api.images(f)])
    if (seq !== librarySeq) return
    const ids = new Set(images.map((i) => i.id))
    const selected = new Set([...get().selected].filter((id) => ids.has(id)))
    set({ tree, images, selected, imagesKey: JSON.stringify(f), libraryVersion: get().libraryVersion + 1 })
  },
  setNode: (node) => {
    set({ filter: { ...get().filter, node }, viewerIndex: null, selected: new Set(), selecting: false, menuOpen: false, view: 'library' })
    void get().refreshLibrary()
  },
  setRatings: (ratings, prev) => {
    set({ filter: { ...get().filter, ratings }, viewerIndex: null })
    void get().saveSettings(prev === undefined ? { libRatings: ratings } : { libRatings: ratings, libRatingsPrev: prev })
    void get().refreshLibrary()
  },
  reshuffle: () => {
    if (get().filter.sort === 'random') set({ filter: { ...get().filter, seed: (Date.now() * 7919) % 2147483647 } })
    void get().refreshLibrary()
  },
  setGroupFilter: (groups) => {
    set({ filter: { ...get().filter, groups }, viewerIndex: null })
    void get().saveSettings({ libGroups: groups })
    void get().refreshLibrary()
  },
  setFavOnly: (favOnly) => {
    set({ filter: { ...get().filter, favOnly }, viewerIndex: null })
    void get().saveSettings({ libFavOnly: favOnly })
    void get().refreshLibrary()
  },
  setSort: (sort) => {
    set({ filter: { ...get().filter, sort } })
    void get().saveSettings({ libSort: sort })
    void get().refreshLibrary()
  },
  setDir: (dir) => {
    set({ filter: { ...get().filter, dir } })
    void get().saveSettings({ libDir: dir })
    void get().refreshLibrary()
  },
  setQuery: (q) => {
    set({ filter: { ...get().filter, q }, viewerIndex: null })
    void get().refreshLibrary()
  },
  openViewer: (viewerIndex) => set({ viewerIndex }),
  treeReveal: null,
  goToNode: (node) => {
    set({
      filter: { ...get().filter, node, q: '' },
      viewerIndex: null,
      selected: new Set(),
      treeReveal: { node, n: (get().treeReveal?.n ?? 0) + 1 }
    })
    void get().refreshLibrary()
  }
}))
