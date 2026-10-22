// This phone's changes. Each one is applied to the model at once, kept in a
// journal on the phone, and written to the NAS as a 모바일 변경 파일
// (<정리 폴더>/.sorta/mobile/<device>-<time>.json, shared/mobile.ts) a moment
// later — Sorta (PC) applies those files and deletes them.
//
// On load the journal is laid over the 분류 정보 파일 again, except changes
// the PC already has: their file is gone from the NAS and the 분류 정보 파일
// was written after them.
import type { MobileEdit, MobileEditFile } from '../shared/mobile'
import { MOBILE_DIR, MOBILE_FORMAT, MOBILE_VERSION } from '../shared/mobile'
import type { Model } from './model'
import { joinPath, native } from './native'

const JOURNAL = 'sorta-journal'

interface Entry {
  e: MobileEdit
  file: string | null // the NAS file it went into (null = not written yet)
}

// One user action = its changes and what undoes / redoes it.
interface Step {
  label: string
  undo: MobileEdit[]
  redo: MobileEdit[]
}

export class Edits {
  private journal: Entry[] = []
  private undoStack: Step[] = []
  private redoStack: Step[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private writing: Promise<void> | null = null
  onChange: () => void = () => {}
  onError: (msg: string) => void = () => {}

  constructor(
    private model: Model,
    private dir: string, // <정리 폴더>/.sorta/mobile
    private device: string
  ) {}

  static dirOf(organizeDir: string): string {
    return joinPath(organizeDir, `.sorta/${MOBILE_DIR}`)
  }

  // Lay the journal over a freshly read file (see the header).
  async restore(): Promise<number> {
    let saved: Entry[] = []
    try {
      saved = JSON.parse(localStorage.getItem(JOURNAL) ?? '[]') as Entry[]
    } catch {
      saved = []
    }
    let onNas = new Set<string>()
    try {
      onNas = new Set((await native.fsReaddir({ path: this.dir })).entries.map((x) => x.name))
    } catch {
      // no folder yet: nothing was written, or the PC took everything
    }
    this.journal = saved.filter((x) => x.file === null || onNas.has(x.file) || x.e.at > this.model.createdAt)
    for (const x of this.journal) this.model.apply(x.e)
    this.save()
    if (this.journal.some((x) => x.file === null)) this.flushSoon(0)
    return this.journal.length
  }

  get pending(): number {
    return this.journal.filter((x) => x.file === null).length
  }
  get waiting(): number {
    return this.journal.length // written but not yet taken by the PC included
  }

  // Record one user action: `fn` makes the edits (applied right away).
  record(label: string, before: MobileEdit[], after: MobileEdit[]): void {
    if (!after.length) return
    for (const e of after) this.push(e)
    this.undoStack.push({ label, undo: before, redo: after })
    if (this.undoStack.length > 100) this.undoStack.shift()
    this.redoStack = []
    this.onChange()
  }

  private push(e: MobileEdit): void {
    this.model.apply(e)
    this.journal.push({ e, file: null })
    this.save()
    this.flushSoon()
  }

  undo(): string | null {
    const s = this.undoStack.pop()
    if (!s) return null
    const at = Date.now()
    for (const e of s.undo) this.push({ ...e, at })
    this.redoStack.push(s)
    this.onChange()
    return s.label
  }
  redo(): string | null {
    const s = this.redoStack.pop()
    if (!s) return null
    const at = Date.now()
    for (const e of s.redo) this.push({ ...e, at })
    this.undoStack.push(s)
    this.onChange()
    return s.label
  }
  canUndo(): boolean {
    return this.undoStack.length > 0
  }
  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  private save(): void {
    try {
      localStorage.setItem(JOURNAL, JSON.stringify(this.journal))
    } catch {
      this.onError('변경 기록을 저장하지 못했습니다 (저장 공간 부족)')
    }
  }

  flushSoon(ms = 2500): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.flush(), ms)
  }

  // Unwritten changes → one new file on the NAS. Failures stay in the journal
  // (tried again on the next change / start).
  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (this.writing) await this.writing
    const todo = this.journal.filter((x) => x.file === null)
    if (!todo.length) return
    const now = Date.now()
    const name = `${this.device}-${now}.json`
    const f: MobileEditFile = {
      format: MOBILE_FORMAT,
      version: MOBILE_VERSION,
      device: this.device,
      createdAt: now,
      basedOn: this.model.createdAt,
      edits: todo.map((x) => x.e)
    }
    this.writing = (async () => {
      try {
        await native.fsMkdir({ path: this.dir })
        await native.fsWriteText({ path: joinPath(this.dir, name), data: JSON.stringify(f) })
        for (const x of todo) x.file = name
        this.save()
        this.onChange()
      } catch (e) {
        this.onError(`NAS에 변경을 저장하지 못했습니다: ${String((e as Error)?.message ?? e)}`)
        this.flushSoon(30_000)
      }
    })()
    await this.writing
    this.writing = null
  }

  // Another 정리 폴더 / NAS: the journal belongs to the old one.
  static clear(): void {
    try {
      localStorage.removeItem(JOURNAL)
    } catch {
      // nothing kept
    }
  }
}
