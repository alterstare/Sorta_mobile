// Where the user was, kept across a restart: Android may kill the app while it
// sits in the background, and coming back then starts it fresh. The screen
// (view, list, 크게 보기 picture, scroll positions, 검토 place) is written to
// localStorage whenever it changes and laid back by store.load().
import type { LibraryNode, ReviewKind } from '../../shared/types'
import { native } from '../../backend/native'
import type { CharTab, View } from './store'

const KEY = 'sorta-session'

// kept entries worth a restart (scroll tops, 검토 place, folded tree rows)
const KEPT = /^(grid\.scroll|scroll\.|review\.index\.|manage\.q$|tree\.closed$)/

export interface Session {
  view: View
  reviewKind: ReviewKind
  charTab: CharTab
  node: LibraryNode
  q: string
  seed?: number
  viewerId: number | null // the picture open in 크게 보기 (ids survive a reload, indexes may not)
  kept: Record<string, unknown>
}

export function readSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Session | null
    if (!s || typeof s !== 'object' || !s.node) return null
    for (const [k, v] of Object.entries(s.kept ?? {})) if (k === 'tree.closed' && Array.isArray(v)) s.kept[k] = new Set(v)
    return s
  } catch {
    return null
  }
}

let last = ''
export function writeSession(s: Session): void {
  const kept = Object.fromEntries(
    Object.entries(s.kept)
      .filter(([k]) => KEPT.test(k))
      .map(([k, v]) => [k, v instanceof Set ? [...v] : v])
  )
  const text = JSON.stringify({ ...s, kept })
  if (text === last) return
  last = text
  try {
    localStorage.setItem(KEY, text)
  } catch {
    // storage blocked: the app just starts fresh next time
  }
}

// Leaving the app (home button, app switch, screen off): scroll positions that
// are only saved on unmount get written now, since the process may not come back.
export function onLeave(cb: () => void): () => void {
  const vis = (): void => {
    if (document.visibilityState === 'hidden') cb()
  }
  document.addEventListener('visibilitychange', vis)
  const h = native.addListener('pause', cb).catch(() => null)
  return () => {
    document.removeEventListener('visibilitychange', vis)
    void h.then((x) => x?.remove())
  }
}
