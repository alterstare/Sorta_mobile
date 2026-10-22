// 자동 업데이트 (sideloaded APK, as in Halftone 모바일): at start, ask GitHub
// for the latest release of this app's repo; when its tag is newer than the
// installed version, download its .apk into the app cache (progress in the
// activity bar), then "설치" hands it to the system installer (the user
// confirms there). Off in 설정 › 업데이트.
import type { UpdateStatus } from '../shared/ipc'
import { native } from './native'
import { loadSettings } from './settings'

const REPO = 'alterstare/Sorta_mobile'

let status: UpdateStatus = { state: 'idle' }
let apk: string | null = null
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
  if (status.state === 'downloading' || status.state === 'downloaded') return status
  set({ state: 'checking' })
  try {
    const { version } = await native.appInfo()
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
    if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`)
    const rel = (await res.json()) as { tag_name?: string; draft?: boolean; assets?: { name: string; browser_download_url: string }[] }
    const latest = String(rel.tag_name ?? '').replace(/^v/i, '')
    const asset = rel.assets?.find((a) => a.name.toLowerCase().endsWith('.apk'))
    if (!latest || rel.draft || !asset || !newer(latest, version)) {
      set({ state: 'none', version })
      return status
    }
    set({ state: 'downloading', version: latest, percent: 0 })
    const off = await native.addListener('updateProgress', (e) => {
      if (e.total > 0) set({ state: 'downloading', version: latest, percent: Math.round((e.done / e.total) * 100) })
    })
    try {
      apk = (await native.downloadUpdate({ url: asset.browser_download_url, name: `Sorta-${latest}.apk` })).path
    } finally {
      void off.remove()
    }
    set({ state: 'downloaded', version: latest, percent: 100 })
  } catch (e) {
    set({ state: 'error', error: String((e as Error)?.message ?? e) })
  }
  return status
}

export async function installUpdate(): Promise<void> {
  if (!apk) return
  const r = await native.installApk({ path: apk })
  if (r.needPermission) set({ ...status, error: '설치 권한을 허용한 뒤 다시 설치를 누르세요' })
}
