// 업데이트 알림 (sideloaded APK, as in Halftone 모바일): at start, ask GitHub for
// the latest release of this app's repo; when its tag is newer than the
// installed version, show it (activity bar, 설정 › 버전). "업데이트" opens the
// release page in the browser — the user downloads and installs the APK there.
// The app itself never downloads or installs APKs: doing that
// (REQUEST_INSTALL_PACKAGES + a download at launch) gets it blocked by Play
// Protect as harmful. Off in 설정 › 업데이트.
import type { UpdateStatus } from '../shared/ipc'
import { native } from './native'
import { loadSettings } from './settings'

const REPO = 'alterstare/Sorta_mobile'

let status: UpdateStatus = { state: 'idle' }
let page: string | null = null // release page of the version found
const subs = new Set<(s: UpdateStatus) => void>()
const set = (s: UpdateStatus): void => {
  status = s
  subs.forEach((f) => f(s))
}
export const updateStatus = (): UpdateStatus => status
export function onUpdate(cb: (s: UpdateStatus) => void): () => void {
  subs.add(cb)
  return () => subs.delete(cb)
}

// "1.2.10" > "1.2.9" (numeric per part; missing parts = 0).
function newer(a: string, b: string): boolean {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0)
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d > 0
  }
  return false
}

// manual: from 설정 (runs even with 자동 업데이트 off, reports "최신").
export async function checkForUpdate(manual = false): Promise<UpdateStatus> {
  if (!manual && loadSettings().autoUpdate === false) return status
  set({ state: 'checking' })
  try {
    const { version } = await native.appInfo()
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
    if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`)
    const rel = (await res.json()) as { tag_name?: string; draft?: boolean; html_url?: string }
    const latest = String(rel.tag_name ?? '').replace(/^v/i, '')
    if (!latest || rel.draft || !newer(latest, version)) {
      set({ state: 'none', version })
      return status
    }
    page = rel.html_url ?? `https://github.com/${REPO}/releases/latest`
    set({ state: 'available', version: latest })
  } catch (e) {
    set({ state: 'error', error: String((e as Error)?.message ?? e) })
  }
  return status
}

// "업데이트": the release page in the browser.
export async function installUpdate(): Promise<void> {
  if (page) await native.openUrl({ url: page })
}
