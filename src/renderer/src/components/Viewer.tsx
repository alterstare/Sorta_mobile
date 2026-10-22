// 크게 보기 (phone): title + ✕, the meta line (wraps), stars · ♥ · ＋ group,
// the picture (swipe or tap its left / right side to move), then the edits —
// 캐릭터 추가, the characters, 등급, 단체 사진 / 캐릭터 아닌 그림.
import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { useStore } from '../store'
import { useBack, useSwipe, longPress } from '../touch'
import type { ImageItem, Rating } from '../../../shared/types'
import { CheckIcon, CloseIcon, GroupsIcon, KeyboardArrowLeftIcon, KeyboardArrowRightIcon, PersonOffIcon, WifiOffIcon } from './icons'
import { RATING_LABEL, fmtSize, safeMode } from './ThumbGrid'
import { FavGroup, Stars } from './Rate'
import { useImageMenu } from './ImageMenu'
import CharacterPicker from './CharacterPicker'

const STATUS: Record<string, string> = { auto: '자동', confirmed: '확정', pending: '검토', unknown: '미확인' }
const RATINGS: Exclude<Rating, 'unknown'>[] = ['general', 'sensitive', 'r18']

export default function Viewer({ items }: { items: ImageItem[] }): JSX.Element | null {
  const index = useStore((s) => s.viewerIndex)
  const open = useStore((s) => s.openViewer)
  const settings = useStore((s) => s.settings)
  const img = index === null ? null : items[index]
  const { onContextMenu, menu } = useImageMenu(items)
  const stageRef = useRef<HTMLDivElement>(null)
  const [dx, setDx] = useState(0)
  const [failed, setFailed] = useState(false)
  const [newMode, setNewMode] = useState(false)
  const [revealed, setRevealed] = useState(false) // a blurred picture, tapped to show
  useEffect(() => {
    setFailed(false)
    setRevealed(false)
    setNewMode(false)
  }, [img?.id])
  useBack(index !== null, () => open(null))
  const go = (d: number): void => {
    if (index === null) return
    const n = index + d
    if (n >= 0 && n < items.length) open(n)
  }
  useSwipe(stageRef, { enabled: index !== null, onMove: setDx, onLeft: () => go(1), onRight: () => go(-1) })

  if (!img || index === null) return null
  const sorted = img.characters.filter((c) => c.id !== null && (c.status === 'auto' || c.status === 'confirmed'))
  const ids = sorted.map((c) => c.id!)
  const hasAuto = sorted.some((c) => c.status === 'auto')
  const blur = safeMode(img, settings) === 'blur' && !revealed
  const games = [...new Set(img.characters.map((c) => c.series).filter(Boolean))]
  return (
    <div className="viewer m-viewer">
      <div className="viewer-top">
        <div className="viewer-title">{img.name}</div>
        <button className="icon-btn" title="닫기" onClick={() => open(null)}>
          <CloseIcon />
        </button>
      </div>
      <div className="viewer-meta">
        <span>{RATING_LABEL[img.rating]}</span>
        {img.fileSize !== null && <span>{fmtSize(img.fileSize)}</span>}
        {games.length > 0 && <span>{games.join(', ')}</span>}
        {img.characters
          .filter((c) => c.name)
          .map((c, i) => (
            <span key={i}>
              {c.name} ({STATUS[c.status]}
              {c.status !== 'confirmed' && c.confidence !== null ? ` ${Math.round(c.confidence * 100)}%` : ''})
            </span>
          ))}
        {img.kind === 'group' && <span>{img.groupSeries ? `단체 사진 · ${img.groupSeries}` : '단체 사진'}</span>}
        {img.kind === 'other' && <span>캐릭터 아닌 그림</span>}
        <span>
          {index + 1} / {items.length}
        </span>
      </div>
      <div className="viewer-rate">
        <Stars imgs={[img]} size={20} />
        <FavGroup imgs={[img]} />
      </div>
      <div
        ref={stageRef}
        className="viewer-stage"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const x = (e.clientX - r.left) / r.width
          if (x < 0.3) go(-1)
          else if (x > 0.7) go(1)
          else if (blur) setRevealed(true)
        }}
        {...longPress((e) => onContextMenu(e, img))}
      >
        {img.path && !failed ? (
          <img
            key={img.id}
            className={`viewer-img ${blur ? 'blur' : ''}`}
            style={dx ? { transform: `translateX(${dx}px)`, transition: 'none' } : undefined}
            src={window.api.imageUrl(img.path)}
            onError={() => setFailed(true)}
            draggable={false}
          />
        ) : (
          <div className="viewer-fallback">
            <img className={`viewer-img ${blur ? 'blur' : ''}`} src={window.api.thumbUrl(img.thumb ?? '', '')} draggable={false} />
            <span className="viewer-note">
              <WifiOffIcon />
              {img.path ? '원본을 불러오지 못해 미리 보기를 보여줍니다' : '이 그림의 폴더가 휴대폰에 연결되지 않았습니다 (설정 › 원본 폴더 연결)'}
            </span>
          </div>
        )}
        {index > 0 && (
          <span className="viewer-arrow left">
            <KeyboardArrowLeftIcon />
          </span>
        )}
        {index < items.length - 1 && (
          <span className="viewer-arrow right">
            <KeyboardArrowRightIcon />
          </span>
        )}
      </div>
      {menu}
      <div className="viewer-edit">
        <CharacterPicker placeholder="캐릭터 추가" newMode={newMode} onNewModeChange={setNewMode} onPick={(c) => void window.api.addCharacter(img.id, c.id)} />
        <div className="chip-row edit-chars">
          {sorted.map((c) => (
            <span key={c.id} className={`tag-chip ${c.status === 'confirmed' ? 'confirmed' : ''}`}>
              {c.name}
              <button title="이 캐릭터 빼기" onClick={() => void window.api.confirmCharacters([img.id], ids.filter((x) => x !== c.id))}>
                <CloseIcon />
              </button>
            </span>
          ))}
          {sorted.length === 0 && <span className="edit-none">캐릭터 미지정</span>}
          {hasAuto && (
            <button className="mini" title="자동 분류 결과가 맞다고 확정" onClick={() => void window.api.confirmCharacters([img.id], ids)}>
              <CheckIcon />
              확인
            </button>
          )}
        </div>
        <div className="flat-group edit-row">
          {RATINGS.map((r) => (
            <button key={r} className={`mini ${img.rating === r ? 'on' : ''}`} onClick={() => void window.api.setRating([img.id], r)}>
              {RATING_LABEL[r]}
            </button>
          ))}
        </div>
        <div className="flat-group edit-row">
          <button
            className={`mini ${img.kind === 'group' ? 'on' : ''}`}
            onClick={() =>
              useStore.getState().setGroupShotDialog({ ids: [img.id], suggest: img.groupSeries ?? img.characters.find((c) => c.series)?.series ?? null })
            }
          >
            <GroupsIcon />
            단체 사진
          </button>
          <button className={`mini ${img.kind === 'other' ? 'on' : ''}`} onClick={() => void window.api.markOther([img.id])}>
            <PersonOffIcon />
            캐릭터 아닌 그림
          </button>
        </div>
      </div>
    </div>
  )
}
