// Backend → screens: job progress (the bottom activity bar), library changes
// and toasts. In-process (the backend runs in the WebView too).
import type { ProgressEvent } from '../shared/types'
import type { JobSummary } from '../shared/ipc'

type Fn<T> = (v: T) => void
const subs = { progress: new Set<Fn<ProgressEvent>>(), changed: new Set<Fn<void>>(), toast: new Set<Fn<JobSummary>>() }

export function on<K extends keyof typeof subs>(k: K, fn: (typeof subs)[K] extends Set<infer F> ? F : never): () => void {
  const set = subs[k] as Set<unknown>
  set.add(fn)
  return () => set.delete(fn)
}
export const emitProgress = (e: ProgressEvent): void => subs.progress.forEach((f) => f(e))
export const emitChanged = (): void => subs.changed.forEach((f) => f())
export const emitToast = (t: JobSummary): void => subs.toast.forEach((f) => f(t))

// A job with progress: run(report) → its result; state events around it.
let jobSeq = 1
const cancels = new Map<number, () => void>()
export async function job<T>(
  label: string,
  run: (report: (done: number, total: number, label?: string) => void, signal: AbortSignal) => Promise<T>
): Promise<T> {
  const jobId = jobSeq++
  const ac = new AbortController()
  cancels.set(jobId, () => ac.abort())
  let cur = label
  emitProgress({ jobId, label, done: 0, total: 0, state: 'running' })
  try {
    const v = await run((done, total, l) => {
      if (l) cur = l
      emitProgress({ jobId, label: cur, done, total, state: 'running' })
    }, ac.signal)
    emitProgress({ jobId, label: cur, done: 1, total: 1, state: ac.signal.aborted ? 'cancelled' : 'done' })
    return v
  } catch (e) {
    emitProgress({ jobId, label: cur, done: 0, total: 0, state: 'failed', error: String((e as Error)?.message ?? e) })
    throw e
  } finally {
    cancels.delete(jobId)
  }
}
export function cancelJob(id: number): boolean {
  const c = cancels.get(id)
  c?.()
  return !!c
}
