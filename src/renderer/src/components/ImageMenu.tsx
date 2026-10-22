// Long-press menu for images (grid while selecting, viewer): copy the
// character names, favorite, groups, 평점. Acts on the selection when the
// pressed image is part of it.
import { useCallback, useState } from 'react'
import type { JSX } from 'react'
import { useStore } from '../store'
import { useBack } from '../touch'
import type { ImageItem } from '../../../shared/types'
import ContextMenu from './ContextMenu'
import type { MenuItem } from './ContextMenu'
import { AddIcon, CheckIcon, ContentCopyIcon, DeleteIcon, DownloadIcon, GroupsIcon, FavoriteIcon, StarIcon } from './icons'
import { characterNames, characterTags, copyNames, copyText, createGroup, setStars, toggleFavorite, toggleGroup } from '../collect'

export function useImageMenu(items: ImageItem[]): {
  onContextMenu: (e: { clientX: number; clientY: number }, img: ImageItem) => void
  menu: JSX.Element | null
} {
  const [at, setAt] = useState<{ x: number; y: number; imgs: ImageItem[] } | null>(null)
  const close = useCallback(() => setAt(null), [])
  const onContextMenu = (e: { clientX: number; clientY: number }, img: ImageItem): void => {
    const sel = useStore.getState().selected
    const imgs = sel.has(img.id) && sel.size > 1 ? items.filter((i) => sel.has(i.id)) : [img]
    setAt({ x: e.clientX, y: e.clientY, imgs })
  }
  if (!at) return { onContextMenu, menu: null }
  const imgs = at.imgs
  const fav = imgs.every((i) => i.favorite)
  const groups = useStore.getState().tree?.groups ?? []
  const names = characterNames(imgs)
  const tags = characterTags(imgs)
  const items_: MenuItem[] = [
    {
      label: names ? `캐릭터 이름 복사 (${names.length > 24 ? names.slice(0, 24) + '…' : names})` : '캐릭터 이름 복사',
      icon: <ContentCopyIcon />,
      disabled: !names,
      onClick: () => void copyNames(imgs)
    },
    {
      label: tags ? `캐릭터 태그 복사 (${tags.length > 28 ? tags.slice(0, 28) + '…' : tags})` : '캐릭터 태그 복사',
      icon: <ContentCopyIcon />,
      disabled: !tags,
      onClick: () => void copyText(tags, '태그 복사')
    },
    {
      label: imgs.length === 1 ? '휴대폰에 저장' : `${imgs.length}장 휴대폰에 저장`,
      icon: <DownloadIcon />,
      separator: true,
      onClick: () => void window.api.saveToPhone(imgs.map((i) => i.id)).then((r) => useStore.getState().showToast(r))
    },
    {
      label: fav ? '즐겨찾기 해제' : '즐겨찾기에 추가',
      icon: <FavoriteIcon filled={fav} />,
      separator: true,
      onClick: () => void toggleFavorite(imgs)
    },
    {
      label: '그룹에 추가',
      icon: <AddIcon />,
      children: [
        ...groups.map((g) => ({
          label: g.name,
          icon: imgs.every((i) => i.groups.includes(g.id)) ? <CheckIcon /> : undefined,
          onClick: () => void toggleGroup(imgs, g)
        })),
        { label: '새 그룹…', icon: <AddIcon />, separator: groups.length > 0, onClick: () => useStore.getState().setGroupDialog(imgs.map((i) => i.id)) }
      ]
    },
    {
      label: '평점',
      icon: <StarIcon />,
      children: [5, 4, 3, 2, 1, 0].map((n) => ({
        label: n ? `${n}점` : '평점 지우기',
        icon: imgs.every((i) => i.stars === n) ? <CheckIcon /> : undefined,
        onClick: () => void setStars(imgs, n)
      }))
    },
    {
      label: imgs.length === 1 ? '삭제' : `${imgs.length}장 삭제`,
      icon: <DeleteIcon />,
      separator: true,
      onClick: () => useStore.getState().setTrashDialog(imgs.map((i) => i.id))
    }
  ]
  return { onContextMenu, menu: <ContextMenu x={at.x} y={at.y} items={items_} onClose={close} /> }
}

// 단체 사진으로 분류: which game (or none) — 정리 폴더/게임/단체 or /단체.
export function GroupShotDialog(): JSX.Element | null {
  const d = useStore((s) => s.groupShotDialog)
  const setD = useStore((s) => s.setGroupShotDialog)
  const showToast = useStore((s) => s.showToast)
  const [names, setNames] = useState<string[]>([])
  const [pick, setPick] = useState('')
  const [wasOpen, setWasOpen] = useState(false)
  if (!!d !== wasOpen) {
    setWasOpen(!!d)
    if (d) {
      setPick(d.suggest ?? '')
      void window.api.seriesNames().then(setNames)
    }
  }
  useBack(!!d, () => setD(null))
  if (!d) return null
  const close = (): void => setD(null)
  const go = async (): Promise<void> => {
    close()
    await window.api.markGroup(d.ids, pick || null)
    showToast({ ok: true, message: `${d.ids.length > 1 ? `${d.ids.length}장 ` : ''}단체 사진으로 분류${pick ? ` (${pick})` : ''}` })
    d.after?.()
  }
  const list = pick && !names.includes(pick) ? [pick, ...names] : names
  return (
    <div className="modal-back" onMouseDown={close}>
      <div className="modal small" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>단체 사진으로 분류</h2>
        </div>
        <div className="row-desc">누가 있는지는 정하지 않습니다. 게임을 고르면 정리 폴더의 게임/단체, 모르면 단체 폴더로 옮겨집니다.</div>
        <select
          className="tag-input"
          autoFocus
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void go()
            if (e.key === 'Escape') close()
          }}
        >
          <option value="">게임 미지정</option>
          {list.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <div className="modal-foot">
          <button className="btn" onClick={close}>
            취소
          </button>
          <button className="btn primary" onClick={() => void go()}>
            <GroupsIcon />
            단체 사진으로 분류
          </button>
        </div>
      </div>
    </div>
  )
}

// 삭제 확인: hidden on the phone at once; the PC's Sorta moves the originals
// into <정리 폴더>/삭제됨 when it takes the change (restorable from there).
export function TrashDialog(): JSX.Element | null {
  const ids = useStore((s) => s.trashDialog)
  const setIds = useStore((s) => s.setTrashDialog)
  useBack(!!ids, () => setIds(null))
  if (!ids) return null
  const close = (): void => setIds(null)
  const go = async (): Promise<void> => {
    close()
    await window.api.trash(ids)
    const st = useStore.getState()
    st.setSelecting(false)
    st.showToast({ ok: true, message: `${ids.length}장 삭제 · PC의 Sorta가 삭제됨 폴더로 옮깁니다` })
  }
  return (
    <div className="modal-back" onMouseDown={close}>
      <div className="modal small" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{ids.length}장 삭제</h2>
        </div>
        <div className="row-desc">
          휴대폰 목록에서 바로 빠지고, PC의 Sorta가 이 변경을 받으면 원본을 정리 폴더의 삭제됨 폴더로 옮깁니다. 휴대폰에서는 되돌릴 수 없고, 삭제됨 폴더에서 꺼내면 돌아옵니다.
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={close}>
            취소
          </button>
          <button className="btn danger" onClick={() => void go()}>
            삭제
          </button>
        </div>
      </div>
    </div>
  )
}

// "새 그룹" / "그룹 이름 변경" dialog (from the ＋ popover, the right-click
// menu, or the tree).
export function NewGroupDialog(): JSX.Element | null {
  const ids = useStore((s) => s.groupDialog)
  const setIds = useStore((s) => s.setGroupDialog)
  const rename = useStore((s) => s.renameGroup)
  const setRename = useStore((s) => s.setRenameGroup)
  const showToast = useStore((s) => s.showToast)
  const [name, setName] = useState('')
  const open = ids !== null || rename !== null
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    setName(rename?.name ?? '')
  }
  useBack(open, () => (setIds(null), setRename(null)))
  if (!open) return null
  const close = (): void => (setIds(null), setRename(null))
  const done = async (): Promise<void> => {
    if (!name.trim()) return
    if (rename) {
      try {
        await window.api.renameGroup(rename.id, name)
        showToast({ ok: true, message: '그룹 이름 변경' })
        close()
      } catch (e) {
        showToast({ ok: false, message: String((e as Error).message ?? e) })
      }
    } else if (await createGroup(name, ids ?? [])) close()
  }
  return (
    <div className="modal-back" onMouseDown={close}>
      <div className="modal small" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{rename ? '그룹 이름 변경' : '새 그룹'}</h2>
        </div>
        <input
          className="tag-input"
          autoFocus
          value={name}
          placeholder="그룹 이름"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void done()
            if (e.key === 'Escape') close()
          }}
        />
        {!rename && <div className="row-desc">{ids?.length ? `선택한 그림 ${ids.length}장을 이 그룹에 넣습니다.` : '빈 그룹을 만듭니다.'}</div>}
        <div className="modal-foot">
          <button className="btn" onClick={close}>
            취소
          </button>
          <button className="btn primary" disabled={!name.trim()} onClick={() => void done()}>
            {rename ? '바꾸기' : '만들기'}
          </button>
        </div>
      </div>
    </div>
  )
}
