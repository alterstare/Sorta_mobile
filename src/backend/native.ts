// The Android side (SortaPlugin.java). Paths: local files are absolute paths;
// "/nas/<connId>/<path>" is a file on that NAS connection (WebDAV).
import { registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'

export interface NasConn {
  id: string
  name: string
  type: 'webdav'
  url: string
  user: string
  insecure: boolean // https with a self-signed certificate
  hasPassword?: boolean
}

export interface FsEntry {
  name: string
  exists: boolean
  isDir: boolean
  isFile: boolean
  size: number
  mtime: number
}

export interface LocalImage {
  path: string
  name: string
  size: number
  mtime: number
}

interface SortaPlugin {
  nasList(): Promise<{ conns: NasConn[] }>
  nasTest(o: { conn: Partial<NasConn>; password?: string }): Promise<{ count: number }>
  nasSave(o: { conn: Partial<NasConn>; password?: string }): Promise<{ id: string }>
  nasRemove(o: { id: string }): Promise<void>
  fsReadText(o: { path: string }): Promise<{ data: string }>
  fsWriteText(o: { path: string; data: string }): Promise<void>
  fsStat(o: { path: string }): Promise<FsEntry>
  fsReaddir(o: { path: string }): Promise<{ entries: FsEntry[] }>
  fsMkdir(o: { path: string }): Promise<void>
  fsRm(o: { path: string }): Promise<void>
  listImages(o: { dir: string }): Promise<{ files: LocalImage[] }>
  upload(o: { from: string; to: string }): Promise<{ size: number }>
  deleteLocal(o: { paths: string[] }): Promise<{ deleted: string[] }>
  pickFolder(): Promise<{ path: string | null }>
  storageStatus(): Promise<{ granted: boolean }>
  requestStorage(): Promise<{ granted: boolean }>
  appInfo(): Promise<{ version: string; code: number }>
  setTheme(o: { dark: boolean }): Promise<void>
  toast(o: { text: string }): Promise<void>
  exitApp(): Promise<void>
  cacheInfo(): Promise<{ bytes: number; files: number }>
  clearCache(): Promise<void>
  setCacheLimit(o: { bytes: number }): Promise<void>
  addListener(ev: 'back', cb: () => void): Promise<PluginListenerHandle>
  addListener(ev: 'resume' | 'pause', cb: () => void): Promise<PluginListenerHandle>
}

export const native = registerPlugin<SortaPlugin>('Sorta')

export const isNas = (p: string): boolean => p.startsWith('/nas/')

function b64url(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Served by SortaWebViewClient.java (same origin as the app):
//   img  — a picture (NAS ones go through the phone's cache)
//   th   — a 미리 보기: the NAS thumb, else made from the original (cached)
//   lth  — a 미리 보기 of a phone file
//   raw  — a NAS file as it is now (no cache): the 분류 정보 파일
export const imgUrl = (path: string): string => `https://localhost/_s/img/${b64url(path)}`
export const thumbUrl = (thumb: string, original: string): string =>
  `https://localhost/_s/th/${b64url(thumb)}${original ? `?o=${b64url(original)}` : ''}`
export const localThumbUrl = (path: string, mtime: number): string => `https://localhost/_s/lth/${b64url(path)}?m=${mtime}`
export const rawUrl = (path: string): string => `https://localhost/_s/raw/${b64url(path)}?t=${Date.now()}`

// "/nas/<id>/a/b" ⇄ id + "a/b"
export function nasParts(p: string): { id: string; rel: string } {
  const rest = p.slice('/nas/'.length)
  const i = rest.indexOf('/')
  return i < 0 ? { id: rest, rel: '' } : { id: rest.slice(0, i), rel: rest.slice(i + 1).replace(/\/+$/, '') }
}
export const nasPath = (id: string, rel: string): string => `/nas/${id}${rel ? '/' + rel.replace(/^\/+/, '') : ''}`
export const joinPath = (a: string, b: string): string => `${a.replace(/\/+$/, '')}/${b.replace(/^\/+/, '')}`
