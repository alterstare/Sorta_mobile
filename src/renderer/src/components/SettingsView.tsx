// 설정 (phone): NAS (WebDAV) 연결, Sorta의 정리 폴더, PC 원본 폴더 ↔ NAS
// 폴더 연결, 올리기 폴더, 화면, 캐시. Saved as soon as changed.
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { useStore } from '../store'
import { useKeptScroll } from '../keep'
import { useBack } from '../touch'
import type { NasConnInfo } from '../../../shared/ipc'
import { CheckIcon, FolderIcon, FolderOpenIcon, KeyboardArrowLeftIcon, LanIcon, RefreshIcon } from './icons'
import { Sheet } from './Library'
import { nasParts, nasPath } from '../../../backend/native'

// "/nas/<id>/photo/sorted" → "photo/sorted" (the connection named once above)
const shown = (p: string): string => (p.startsWith('/nas/') ? '/' + nasParts(p).rel : p)

const fmtBytes = (n: number): string =>
  n >= 1073741824 ? `${(n / 1073741824).toFixed(1)} GB` : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`
const fmtTime = (t: number): string =>
  new Date(t).toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })

// A PC folder (UNC \\nas\share\sub or a drive path) → the NAS path it most
// likely is: Synology / QNAP WebDAV serve the shares at the root.
function guess(root: string, nasId: string): string | null {
  const m = /^[\\/]{2}[^\\/]+[\\/](.+)$/.exec(root)
  if (!m) return null
  return nasPath(nasId, m[1].split(/[\\/]+/).filter(Boolean).join('/'))
}

export default function SettingsView(): JSX.Element {
  const pageRef = useKeptScroll<HTMLDivElement>('settings')
  const { settings, saveSettings, showToast, status } = useStore()
  const [conns, setConns] = useState<NasConnInfo[]>([])
  const [editing, setEditing] = useState<Partial<NasConnInfo> | null>(null)
  const [browse, setBrowse] = useState<{ title: string; start: string; onPick: (p: string) => void } | null>(null)
  const [version, setVersion] = useState('')
  const [cache, setCache] = useState<{ bytes: number; files: number } | null>(null)
  useBack(!!editing, () => setEditing(null))

  const loadConns = (): void => void window.api.nasList().then(setConns)
  useEffect(() => {
    loadConns()
    void window.api.appVersion().then(setVersion).catch(() => {})
    void window.api.cacheInfo().then(setCache).catch(() => {})
  }, [])
  if (!settings) return <div className="page" />
  const conn = conns.find((c) => c.id === settings.nasId) ?? null
  const roots = status.state === 'ready' ? status.roots : []
  const pick = (title: string, start: string, onPick: (p: string) => void): void => {
    if (!settings.nasId) return showToast({ ok: false, message: '먼저 NAS를 연결하세요' })
    setBrowse({ title, start: start || nasPath(settings.nasId, ''), onPick })
  }

  return (
    <div ref={pageRef} className="page settings">
      <div className="page-head">
        <h1>설정</h1>
      </div>

      <section className="card">
        <h2>NAS 연결</h2>
        <div className="row">
          <div className="row-text">
            <div className="row-title">{conn ? conn.name : '연결된 NAS가 없습니다'}</div>
            <div className="row-desc">
              {conn ? `${conn.url}${conn.user ? ` · ${conn.user}` : ''}` : 'WebDAV로 NAS에 연결합니다 (시놀로지 · QNAP 등에서 WebDAV 서버를 켜 두세요).'}
            </div>
          </div>
          <div className="flat-group">
            <button className="mini" onClick={() => setEditing(conn ?? { type: 'webdav', name: 'NAS', url: '', user: '', insecure: false })}>
              <LanIcon />
              {conn ? '수정' : '연결'}
            </button>
          </div>
        </div>
        {conns.length > 1 && (
          <div className="row">
            <div className="row-text">
              <div className="row-title">다른 연결</div>
            </div>
            <div className="flat-group">
              {conns
                .filter((c) => c.id !== settings.nasId)
                .map((c) => (
                  <button key={c.id} className="mini" onClick={() => void saveSettings({ nasId: c.id, organizeDir: '' })}>
                    {c.name}
                  </button>
                ))}
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Sorta 정리 폴더</h2>
        <div className="row">
          <div className="row-text">
            <div className="row-title selectable">{settings.organizeDir ? shown(settings.organizeDir) : '정하지 않았습니다'}</div>
            <div className="row-desc">PC의 Sorta 설정 › 정리 폴더와 같은 NAS 폴더를 고르세요. 그 안의 .sorta 폴더에 분류 정보 파일이 있습니다.</div>
          </div>
          <div className="flat-group">
            <button className="mini" disabled={!settings.nasId} onClick={() => pick('정리 폴더', settings.organizeDir, (p) => void saveSettings({ organizeDir: p }))}>
              <FolderOpenIcon />
              고르기
            </button>
          </div>
        </div>
        {status.state === 'ready' && (
          <div className="row">
            <div className="row-text">
              <div className="row-title">분류 정보 파일</div>
              <div className="row-desc">
                {fmtTime(status.createdAt)} · 그림 {status.files.toLocaleString()}장 · Sorta {status.app}
                {window.api.pendingEdits() > 0 && ` · PC에 아직 반영되지 않은 변경 ${window.api.pendingEdits()}건`}
              </div>
            </div>
            <div className="flat-group">
              <button className="mini" onClick={() => void window.api.reload()}>
                <RefreshIcon />
                다시 불러오기
              </button>
            </div>
          </div>
        )}
        {status.state === 'error' && <div className="row-desc err">{status.message}</div>}
      </section>

      {roots.length > 0 && (
        <section className="card">
          <h2>원본 폴더 연결</h2>
          <div className="row-desc">
            PC의 원본 폴더(아직 정리되지 않은 그림, 검토할 그림)가 NAS의 어느 폴더인지 알려 주세요. 연결하지 않아도 미리 보기와 검토는 되지만, 원본을 크게 볼 수 없습니다.
          </div>
          {roots.map((r) => {
            const cur = settings.roots[r] ?? ''
            const g = settings.nasId ? guess(r, settings.nasId) : null
            return (
              <div key={r} className="row">
                <div className="row-text">
                  <div className="row-title selectable">{r}</div>
                  <div className="row-desc">{cur ? `→ ${shown(cur)}` : '연결하지 않았습니다'}</div>
                </div>
                <div className="row-stack">
                  <div className="flat-group">
                    {g && g !== cur && (
                      <button className="mini primary-text" onClick={() => void saveSettings({ roots: { ...settings.roots, [r]: g } })}>
                        {shown(g)}(으)로 연결
                      </button>
                    )}
                    <button className="mini" onClick={() => pick('원본 폴더', cur || g || '', (p) => void saveSettings({ roots: { ...settings.roots, [r]: p } }))}>
                      <FolderOpenIcon />
                      고르기
                    </button>
                    {cur && (
                      <button
                        className="mini"
                        onClick={() => {
                          const next = { ...settings.roots }
                          delete next[r]
                          void saveSettings({ roots: next })
                        }}
                      >
                        해제
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </section>
      )}

      <section className="card">
        <h2>올리기</h2>
        <div className="row">
          <div className="row-text">
            <div className="row-title">휴대폰 폴더</div>
            <div className="row-desc selectable">{settings.uploadFrom || '정하지 않았습니다'}</div>
          </div>
          <div className="flat-group">
            <button className="mini" onClick={() => void window.api.pickFolder().then((p) => void (p && saveSettings({ uploadFrom: p })))}>
              <FolderOpenIcon />
              고르기
            </button>
          </div>
        </div>
        <div className="row">
          <div className="row-text">
            <div className="row-title">NAS에 올릴 위치</div>
            <div className="row-desc">
              {settings.uploadTo ? shown(settings.uploadTo) : '정하지 않았습니다'} · PC Sorta의 원본 폴더(감시 켜기)로 정하면 올린 그림이 자동으로 분류됩니다.
            </div>
          </div>
          <div className="row-stack">
            <div className="flat-group">
              {roots
                .map((r) => settings.roots[r])
                .filter((p): p is string => !!p && p !== settings.uploadTo)
                .map((p) => (
                  <button key={p} className="mini primary-text" onClick={() => void saveSettings({ uploadTo: p })}>
                    {shown(p)}
                  </button>
                ))}
              <button className="mini" disabled={!settings.nasId} onClick={() => pick('NAS에 올릴 위치', settings.uploadTo, (p) => void saveSettings({ uploadTo: p }))}>
                <FolderOpenIcon />
                고르기
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>화면</h2>
        <div className="row">
          <div className="row-text">
            <div className="row-title">테마</div>
          </div>
          <div className="flat-group">
            {(
              [
                ['light', '라이트'],
                ['dark', '다크']
              ] as const
            ).map(([v, l]) => (
              <button key={v} className={`mini ${settings.theme === v ? 'on' : ''}`} onClick={() => void saveSettings({ theme: v })}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <h2>저장 공간</h2>
        <div className="row">
          <div className="row-text">
            <div className="row-title">NAS 그림 캐시</div>
            <div className="row-desc">
              한 번 본 그림과 미리 보기를 휴대폰에 두어 다시 볼 때 빨리 엽니다.
              {cache && ` 지금 ${fmtBytes(cache.bytes)} (${cache.files.toLocaleString()}개).`}
            </div>
          </div>
          <div className="row-stack">
            <div className="flat-group">
              {[256, 1024, 4096].map((mb) => (
                <button key={mb} className={`mini ${settings.cacheMB === mb ? 'on' : ''}`} onClick={() => void saveSettings({ cacheMB: mb })}>
                  {mb >= 1024 ? `${mb / 1024} GB` : `${mb} MB`}
                </button>
              ))}
            </div>
            <div className="flat-group">
              <button
                className="mini danger"
                onClick={() =>
                  void window.api
                    .clearCache()
                    .then(() => window.api.cacheInfo())
                    .then((c) => (setCache(c), showToast({ ok: true, message: '캐시를 비웠습니다' })))
                }
              >
                캐시 비우기
              </button>
            </div>
          </div>
        </div>
        <div className="row">
          <div className="row-text">
            <div className="row-title">버전</div>
            <div className="row-desc">Sorta 모바일 {version}</div>
          </div>
        </div>
      </section>

      {editing && (
        <ConnSheet
          conn={editing}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            setEditing(null)
            loadConns()
            if (id !== settings.nasId) void saveSettings({ nasId: id, organizeDir: '' })
            else void window.api.reload()
          }}
          onRemoved={() => {
            setEditing(null)
            loadConns()
            void saveSettings({ nasId: null, organizeDir: '' })
          }}
        />
      )}
      {browse && (
        <FolderBrowser
          title={browse.title}
          start={browse.start}
          onClose={() => setBrowse(null)}
          onPick={(p) => {
            setBrowse(null)
            browse.onPick(p)
          }}
        />
      )}
    </div>
  )
}

function ConnSheet({
  conn,
  onClose,
  onSaved,
  onRemoved
}: {
  conn: Partial<NasConnInfo>
  onClose: () => void
  onSaved: (id: string) => void
  onRemoved: () => void
}): JSX.Element {
  const [err, setErr] = useState<string | null>(null)
  const [c, setC] = useState<Partial<NasConnInfo>>(conn)
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState<string | null>(null)
  const set = (patch: Partial<NasConnInfo>): void => (setC((x) => ({ ...x, ...patch })), setOk(null), setErr(null))
  const password = pw || (c.id && conn.hasPassword ? undefined : '')
  const test = async (): Promise<boolean> => {
    setBusy(true)
    setErr(null)
    try {
      const n = await window.api.nasTest(c, password)
      setOk(`연결 성공 · 폴더 ${n}개`)
      return true
    } catch (e) {
      setOk(null)
      setErr(`연결 실패: ${String((e as Error).message ?? e)}`)
      return false
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet title={conn.id ? 'NAS 연결 수정' : 'NAS 연결 (WebDAV)'} onClose={onClose}>
      <label className="field">
        <span>이름</span>
        <input className="tag-input" value={c.name ?? ''} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <label className="field">
        <span>주소</span>
        <input
          className="tag-input"
          value={c.url ?? ''}
          placeholder="https://192.168.0.10:5006"
          inputMode="url"
          autoCapitalize="off"
          onChange={(e) => set({ url: e.target.value.trim() })}
        />
      </label>
      <label className="field">
        <span>아이디</span>
        <input className="tag-input" value={c.user ?? ''} autoCapitalize="off" onChange={(e) => set({ user: e.target.value })} />
      </label>
      <label className="field">
        <span>비밀번호</span>
        <input
          className="tag-input"
          type="password"
          value={pw}
          placeholder={conn.hasPassword ? '바꿀 때만 입력' : ''}
          onChange={(e) => (setPw(e.target.value), setOk(null), setErr(null))}
        />
      </label>
      <button className={`sheet-opt ${c.insecure ? 'on' : ''}`} onClick={() => set({ insecure: !c.insecure })}>
        <span className="menu-box">{c.insecure && <CheckIcon />}</span>
        인증서 확인 건너뛰기 (자체 서명 https)
      </button>
      {ok && <div className="row-desc ok">{ok}</div>}
      {err && <div className="sheet-err">{err}</div>}
      <div className="sheet-foot flat-group">
        {conn.id && (
          <button className="mini danger" onClick={() => void window.api.nasRemove(conn.id!).then(onRemoved)}>
            연결 삭제
          </button>
        )}
        <span className="spacer" />
        <button className="mini" disabled={busy || !c.url} onClick={() => void test()}>
          연결 확인
        </button>
        <button
          className="mini primary"
          disabled={busy || !c.url}
          onClick={async () => {
            if (!(await test())) return
            const id = await window.api.nasSave({ ...c, type: 'webdav', name: c.name?.trim() || 'NAS' }, pw || undefined)
            onSaved(id)
          }}
        >
          저장
        </button>
      </div>
    </Sheet>
  )
}

// Browse the NAS's folders (one level at a time) and pick one.
function FolderBrowser({ title, start, onClose, onPick }: { title: string; start: string; onClose: () => void; onPick: (p: string) => void }): JSX.Element {
  const [path, setPath] = useState(start)
  const [dirs, setDirs] = useState<string[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const { id, rel } = nasParts(path)
  const up = (): void => setPath(nasPath(id, rel.split('/').slice(0, -1).join('/')))
  useBack(true, () => (rel ? up() : onClose()))
  useEffect(() => {
    let alive = true
    setDirs(null)
    setErr(null)
    window.api
      .listDirs(path)
      .then((d) => alive && setDirs(d))
      .catch((e: Error) => {
        if (!alive) return
        // a folder that's gone → its parent
        if (rel) setPath(nasPath(id, rel.split('/').slice(0, -1).join('/')))
        else setErr(String(e.message ?? e))
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="fb-path">
        {rel && (
          <button className="mini icon" title="위로" onClick={up}>
            <KeyboardArrowLeftIcon />
          </button>
        )}
        <span className="selectable">/{rel}</span>
      </div>
      {err && <div className="row-desc err">{err}</div>}
      {!dirs && !err && <div className="row-desc pad">불러오는 중…</div>}
      {dirs?.map((d) => (
        <button key={d} className="sheet-opt" onClick={() => setPath(nasPath(id, rel ? `${rel}/${d}` : d))}>
          <FolderIcon />
          {d}
        </button>
      ))}
      {dirs && dirs.length === 0 && <div className="row-desc pad">하위 폴더가 없습니다.</div>}
      <div className="sheet-foot flat-group">
        <span className="spacer" />
        <button className="mini primary" disabled={!rel} onClick={() => onPick(path)}>
          <CheckIcon />이 폴더 선택
        </button>
      </div>
    </Sheet>
  )
}
