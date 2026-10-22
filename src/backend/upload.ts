// 올리기: the pictures in a phone folder (설정 › 올릴 폴더) go up to a NAS
// folder (설정 › NAS에 올릴 위치 — e.g. one of Sorta's 원본 폴더, so the PC
// imports and sorts them). "올린 그림 삭제" then removes from the phone only
// what is on the NAS with the same size.
import type { JobSummary, UploadItem } from '../shared/ipc'
import { job } from './bus'
import { joinPath, native } from './native'
import { loadSettings } from './settings'

const DONE = 'sorta-uploaded' // phone path → { size, mtime, to }

type Done = Record<string, { size: number; mtime: number; to: string }>
function loadDone(): Done {
  try {
    return JSON.parse(localStorage.getItem(DONE) ?? '{}') as Done
  } catch {
    return {}
  }
}
function saveDone(d: Done): void {
  try {
    localStorage.setItem(DONE, JSON.stringify(d))
  } catch {
    // storage full
  }
}

const isDone = (d: Done, f: { path: string; size: number; mtime: number }): boolean => {
  const x = d[f.path]
  return !!x && x.size === f.size && x.mtime === f.mtime
}

export async function uploadList(): Promise<UploadItem[]> {
  const s = loadSettings()
  if (!s.uploadFrom) return []
  const { files } = await native.listImages({ dir: s.uploadFrom })
  const d = loadDone()
  return files.sort((a, b) => b.mtime - a.mtime).map((f) => ({ ...f, uploaded: isDone(d, f) }))
}

async function ensureAccess(): Promise<void> {
  if ((await native.storageStatus()).granted) return
  if (!(await native.requestStorage()).granted) throw new Error('파일 접근 권한이 필요합니다 (설정 › 앱 › Sorta › 권한)')
}

// A free name in the NAS folder: same name + same size = already there.
async function target(dir: string, names: Map<string, number>, f: UploadItem): Promise<{ path: string; skip: boolean }> {
  const dot = f.name.lastIndexOf('.')
  const stem = dot > 0 ? f.name.slice(0, dot) : f.name
  const ext = dot > 0 ? f.name.slice(dot) : ''
  for (let n = 1; ; n++) {
    const name = n === 1 ? f.name : `${stem} (${n})${ext}`
    const size = names.get(name.toLowerCase())
    if (size === undefined) return { path: joinPath(dir, name), skip: false }
    if (size === f.size) return { path: joinPath(dir, name), skip: true }
  }
}

export function uploadAll(): Promise<JobSummary> {
  return job('NAS에 올리기', async (report, signal) => {
    const s = loadSettings()
    if (!s.uploadFrom || !s.uploadTo) throw new Error('설정에서 올릴 폴더와 NAS에 올릴 위치를 정하세요')
    await ensureAccess()
    const todo = (await uploadList()).filter((f) => !f.uploaded)
    if (!todo.length) return { ok: true, message: '올릴 그림이 없습니다' }
    await native.fsMkdir({ path: s.uploadTo })
    const names = new Map((await native.fsReaddir({ path: s.uploadTo })).entries.filter((e) => e.isFile).map((e) => [e.name.toLowerCase(), e.size]))
    const d = loadDone()
    let ok = 0
    let skipped = 0
    const failed: string[] = []
    for (let i = 0; i < todo.length; i++) {
      if (signal.aborted) break
      const f = todo[i]
      report(i, todo.length, `NAS에 올리기 · ${f.name}`)
      try {
        const t = await target(s.uploadTo, names, f)
        if (!t.skip) {
          const r = await native.upload({ from: f.path, to: t.path })
          if (r.size !== f.size) throw new Error('크기가 다릅니다')
          names.set(t.path.split('/').pop()!.toLowerCase(), f.size)
          ok++
        } else skipped++
        d[f.path] = { size: f.size, mtime: f.mtime, to: t.path }
        saveDone(d)
      } catch (e) {
        failed.push(`${f.name}: ${String((e as Error)?.message ?? e)}`)
      }
    }
    report(todo.length, todo.length, 'NAS에 올리기 완료')
    const parts = [`${ok}장 올리기 완료`]
    if (skipped) parts.push(`이미 있는 ${skipped}장 건너뛰기`)
    if (failed.length) parts.push(`${failed.length}장 실패`)
    if (signal.aborted) parts.push('중간에 멈춤')
    return { ok: !failed.length, message: parts.join(' · ') }
  })
}

// Only pictures the NAS really has (size checked again now).
export function deleteUploaded(): Promise<JobSummary> {
  return job('올린 그림 삭제', async (report) => {
    await ensureAccess()
    const d = loadDone()
    const list = (await uploadList()).filter((f) => f.uploaded)
    if (!list.length) return { ok: true, message: '삭제할 그림이 없습니다 (올리기를 마친 그림만 지웁니다)' }
    const sure: string[] = []
    for (let i = 0; i < list.length; i++) {
      report(i, list.length, '올린 그림 확인 중')
      const f = list[i]
      try {
        const st = await native.fsStat({ path: d[f.path].to })
        if (st.exists && st.size === f.size) sure.push(f.path)
      } catch {
        // NAS unreachable: keep it on the phone
      }
    }
    const { deleted } = await native.deleteLocal({ paths: sure })
    for (const p of deleted) delete d[p]
    saveDone(d)
    const left = list.length - deleted.length
    return { ok: true, message: `휴대폰에서 ${deleted.length}장 삭제${left ? ` · NAS에서 확인하지 못한 ${left}장은 남겨 두었습니다` : ''}` }
  })
}
