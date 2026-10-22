import { useEffect } from 'react'
import type { JSX } from 'react'
import { useStore } from './store'
import { popBack, useBack } from './touch'
import { FactCheckIcon, MenuIcon, PersonIcon, PhotoLibraryIcon, SettingsIcon, UploadIcon } from './components/icons'
import Library from './components/Library'
import ManageView from './components/ManageView'
import OrgView from './components/OrgView'
import Review from './components/Review'
import SettingsView from './components/SettingsView'
import UploadView from './components/UploadView'
import MenuDrawer from './components/MenuDrawer'
import ActivityBar from './components/ActivityBar'
import { GroupShotDialog, NewGroupDialog, TrashDialog } from './components/ImageMenu'
import { native } from '../../backend/native'

// 관리: 캐릭터 / 소속 tabs (under the page title).
function CharactersView(): JSX.Element {
  const tab = useStore((s) => s.charTab)
  const setTab = useStore((s) => s.setCharTab)
  const tabs = (
    <div className="flat-group">
      {(
        [
          ['manage', '캐릭터'],
          ['org', '소속']
        ] as const
      ).map(([k, label]) => (
        <button key={k} className={`mini ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
          {label}
        </button>
      ))}
    </div>
  )
  return tab === 'manage' ? <ManageView tabs={tabs} /> : <OrgView tabs={tabs} />
}

// Top bar: ☰ · 라이브러리 · 검토 · 관리 … 올리기 · 설정 (icons only).
export default function App(): JSX.Element {
  const { view, setView, load, onProgress, refreshLibrary, toast, dismissToast, setMenuOpen } = useStore()

  useEffect(() => {
    void load()
    const offProgress = window.api.onProgress(onProgress)
    const offToast = window.api.onToast((t) => useStore.getState().showToast(t))
    const offChanged = window.api.onLibraryChanged(() => void refreshLibrary())
    const offStatus = window.api.onStatus((status) => {
      useStore.setState({ status })
      void refreshLibrary()
    })
    // Android back: the topmost open thing closes first; then back to the
    // library, then the full library, then exit.
    const back = native.addListener('back', () => {
      if (popBack()) return
      const s = useStore.getState()
      if (s.menuOpen) return s.setMenuOpen(false)
      if (s.view !== 'library') return s.setView('library')
      if (s.filter.node.type !== 'all' || s.filter.q) {
        if (s.filter.q) s.setQuery('')
        if (s.filter.node.type !== 'all') s.setNode({ type: 'all' })
        return
      }
      window.api.exit()
    })
    return () => {
      offProgress()
      offToast()
      offChanged()
      offStatus()
      void back.then((h) => h.remove())
    }
  }, [load, onProgress, refreshLibrary])

  const theme = useStore((s) => s.settings?.theme)
  useEffect(() => {
    if (!theme) return
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('sorta-theme', theme)
    } catch {
      // per-device convenience only
    }
  }, [theme])

  useBack(view === 'review', () => setView('library'))
  // 검토: character review first; only rating checks left → 등급 확인
  const counts = useStore((s) => s.tree?.counts)
  const openReview = useStore((s) => s.openReview)
  const reviewCount = (counts?.pending ?? 0) + (counts?.ratingReview ?? 0)
  const reviewKind = !counts?.pending && counts?.ratingReview ? 'rating' : 'character'

  return (
    <div className="app">
      <header className="topbar">
        <button className="icon-btn" title="메뉴" onClick={() => setMenuOpen(true)}>
          <MenuIcon />
        </button>
        <button className={`icon-btn ${view === 'library' ? 'on' : ''}`} title="라이브러리" onClick={() => setView('library')}>
          <PhotoLibraryIcon />
        </button>
        <button className={`icon-btn ${view === 'review' ? 'on' : ''}`} title="검토" onClick={() => openReview(reviewKind)}>
          <FactCheckIcon />
          {reviewCount > 0 && <span className="icon-badge">{reviewCount > 99 ? '99+' : reviewCount}</span>}
        </button>
        <button className={`icon-btn ${view === 'manage' ? 'on' : ''}`} title="관리" onClick={() => setView('manage')}>
          <PersonIcon />
        </button>
        <div className="spacer" />
        <button className={`icon-btn ${view === 'upload' ? 'on' : ''}`} title="올리기" onClick={() => setView('upload')}>
          <UploadIcon />
        </button>
        <button className={`icon-btn ${view === 'settings' ? 'on' : ''}`} title="설정" onClick={() => setView('settings')}>
          <SettingsIcon />
        </button>
      </header>
      <main className="body">
        {(view === 'library' || view === 'review') && <Library />}
        {view === 'manage' && <CharactersView />}
        {view === 'settings' && <SettingsView />}
        {view === 'upload' && <UploadView />}
      </main>
      {view === 'review' && <Review />}
      <MenuDrawer />
      <ActivityBar />
      <NewGroupDialog />
      <GroupShotDialog />
      <TrashDialog />
      {toast && (
        <div className={`toast ${toast.ok ? '' : 'err'}`} onClick={dismissToast}>
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  )
}
