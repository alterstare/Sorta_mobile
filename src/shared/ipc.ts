// What the screens see as `window.api` (src/backend/api.ts). The library
// part has the PC app's shape (desktop shared/ipc.ts), so its screens carry
// over; the rest is the phone's own (NAS, 올리기).
import type {
  CharacterHit,
  ImageItem,
  LibraryFilter,
  LibraryTree,
  ManagedCharacter,
  OrgChart,
  ProgressEvent,
  Rating,
  RatingPick,
  ReviewItem,
  ReviewKind,
  Settings,
  UndoResult
} from './types'

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'none' | 'downloading' | 'downloaded' | 'error'
  version?: string
  percent?: number
  error?: string
}

export interface JobSummary {
  ok: boolean
  message: string
}

export type LibStatus =
  | { state: 'setup' } // no NAS / 정리 폴더 yet
  | { state: 'loading' }
  | { state: 'ready'; createdAt: number; app: string; files: number; roots: string[] }
  | { state: 'error'; message: string }

export interface NasConnInfo {
  id: string
  name: string
  type: 'webdav'
  url: string
  user: string
  insecure: boolean
  hasPassword?: boolean
}

export interface UploadItem {
  path: string
  name: string
  size: number
  mtime: number
  uploaded: boolean // went up (same size on the NAS)
}

export interface Api {
  status: () => LibStatus
  onStatus: (cb: (s: LibStatus) => void) => () => void
  reload: () => Promise<void>
  onProgress: (cb: (e: ProgressEvent) => void) => () => void
  onToast: (cb: (t: JobSummary) => void) => () => void
  onLibraryChanged: (cb: () => void) => () => void
  cancelJob: (id: number) => Promise<boolean>
  getSettings: () => Promise<Settings>
  saveSettings: (patch: Partial<Settings>) => Promise<Settings>
  appVersion: () => Promise<string>

  // library (each change is one 되돌리기 step)
  tree: (ratings?: RatingPick[], groups?: number[]) => Promise<LibraryTree>
  images: (f: LibraryFilter) => Promise<ImageItem[]>
  imageUrl: (path: string) => string // a picture, or "thumb\npath" (review references)
  thumbUrl: (thumb: string, path: string) => string
  setFavorite: (ids: number[], on: boolean) => Promise<void>
  setStars: (ids: number[], stars: number) => Promise<void>
  groups: () => Promise<{ id: number; name: string }[]>
  createGroup: (name: string, ids?: number[]) => Promise<number>
  renameGroup: (id: number, name: string) => Promise<void>
  deleteGroup: (id: number) => Promise<void>
  setGroupMembership: (ids: number[], groupId: number, on: boolean) => Promise<void>
  reviewQueue: (kind: ReviewKind) => Promise<ReviewItem[]>
  confirmCharacters: (imageIds: number[], characterIds: number[]) => Promise<void>
  addCharacter: (imageId: number, characterId: number) => Promise<void>
  markOther: (imageIds: number[]) => Promise<void>
  markGroup: (imageIds: number[], series: string | null) => Promise<void>
  setRating: (imageIds: number[], rating: Exclude<Rating, 'unknown'>) => Promise<void>
  // One review decision as a single step: characters (+ rating).
  decide: (imageId: number, characterIds: number[], rating: Exclude<Rating, 'unknown'> | null) => Promise<void>
  createCharacter: (name: string, series: string) => Promise<number>
  searchCharacters: (q: string) => Promise<CharacterHit[]>
  characterFromTag: (tag: string) => Promise<CharacterHit>
  seriesNames: () => Promise<string[]>
  undo: () => Promise<UndoResult>
  redo: () => Promise<UndoResult>
  canUndo: () => boolean
  canRedo: () => boolean
  characters: () => Promise<ManagedCharacter[]>
  renameCharacter: (id: number, name: string) => Promise<void>
  orgChart: (series: string) => Promise<OrgChart>
  addAffiliation: (series: string, name: string, parentId: number | null) => Promise<number>
  renameAffiliation: (id: number, name: string) => Promise<void>
  placeCharacters: (ids: number[], affiliationId: number | null) => Promise<void>
  pendingEdits: () => number // changes the PC hasn't taken yet
  // 삭제: hidden here at once; the PC moves the originals into <정리 폴더>/삭제됨
  trash: (ids: number[]) => Promise<void>
  saveToPhone: (ids: number[]) => Promise<JobSummary> // the originals → Pictures/Sorta

  // NAS (WebDAV)
  nasList: () => Promise<NasConnInfo[]>
  nasTest: (conn: Partial<NasConnInfo>, password?: string) => Promise<number>
  nasSave: (conn: Partial<NasConnInfo>, password?: string) => Promise<string>
  nasRemove: (id: string) => Promise<void>
  listDirs: (path: string) => Promise<string[]> // sub-folder names

  // 올리기
  pickFolder: () => Promise<string | null>
  uploadList: () => Promise<UploadItem[]>
  uploadAll: () => Promise<JobSummary>
  deleteUploaded: () => Promise<JobSummary>
  localThumbUrl: (path: string, mtime: number) => string

  // 자동 업데이트
  updateStatus: () => UpdateStatus
  onUpdate: (cb: (s: UpdateStatus) => void) => () => void
  checkUpdate: () => Promise<UpdateStatus>
  installUpdate: () => Promise<void>

  cacheInfo: () => Promise<{ bytes: number; files: number }>
  clearCache: () => Promise<void>
  exit: () => void
}

declare global {
  interface Window {
    api: Api
  }
}
