// Selecting (long press in the grid): the count and what to do with them —
// 캐릭터 지정, 등급, 단체 사진, 캐릭터 아닌 그림, 전체 선택, ✕.
import { useState } from 'react'
import type { JSX } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store'
import { useBack } from '../touch'
import type { Rating } from '../../../shared/types'
import CharacterPicker from './CharacterPicker'
import { CloseIcon, GroupsIcon, PersonIcon, PersonOffIcon, SelectAllIcon } from './icons'
import { RATING_LABEL } from './ThumbGrid'
import { Opt, Sheet } from './Library'

const RATINGS: Exclude<Rating, 'unknown'>[] = ['general', 'sensitive', 'r18']

export default function SelectionBar({ allIds }: { allIds: number[] }): JSX.Element | null {
  const selected = useStore((s) => s.selected)
  const selecting = useStore((s) => s.selecting)
  const setSelected = useStore((s) => s.setSelected)
  const setSelecting = useStore((s) => s.setSelecting)
  const showToast = useStore((s) => s.showToast)
  const [sheet, setSheet] = useState<'char' | 'rating' | null>(null)
  const [newMode, setNewMode] = useState(false)
  useBack(selecting, () => setSelecting(false))
  useBack(!!sheet, () => setSheet(null))
  if (!selecting) return null
  const ids = [...selected]
  const done = (msg: string): void => {
    setSheet(null)
    showToast({ ok: true, message: `${ids.length}장 ${msg}` })
  }

  return createPortal(
    <>
      <div className="sel-bar">
        <span className="sel-count">{ids.length}장</span>
        <div className="flat-group">
          <button className="mini icon" title="캐릭터 지정" disabled={!ids.length} onClick={() => setSheet('char')}>
            <PersonIcon />
          </button>
          <button className="mini" disabled={!ids.length} onClick={() => setSheet('rating')}>
            등급
          </button>
          <button className="mini icon" title="단체 사진" disabled={!ids.length} onClick={() => useStore.getState().setGroupShotDialog({ ids, suggest: null })}>
            <GroupsIcon />
          </button>
          <button
            className="mini icon"
            title="캐릭터 아닌 그림"
            disabled={!ids.length}
            onClick={() => void window.api.markOther(ids).then(() => done('캐릭터 아닌 그림으로 지정'))}
          >
            <PersonOffIcon />
          </button>
          <button className="mini icon" title="전체 선택" onClick={() => setSelected(new Set(allIds))}>
            <SelectAllIcon />
          </button>
          <button className="mini icon" title="선택 끝내기" onClick={() => setSelecting(false)}>
            <CloseIcon />
          </button>
        </div>
      </div>
      {sheet === 'char' && (
        <Sheet title={`${ids.length}장 · 캐릭터 지정`} onClose={() => setSheet(null)}>
          <CharacterPicker
            placeholder="이 캐릭터로 지정"
            newMode={newMode}
            onNewModeChange={setNewMode}
            onPick={(c) => void window.api.confirmCharacters(ids, [c.id]).then(() => done(`${c.name}(으)로 지정`))}
          />
        </Sheet>
      )}
      {sheet === 'rating' && (
        <Sheet title={`${ids.length}장 · 등급`} onClose={() => setSheet(null)}>
          {RATINGS.map((r) => (
            <Opt key={r} on={false} onClick={() => void window.api.setRating(ids, r).then(() => done(`${RATING_LABEL[r]}(으)로 변경`))}>
              {RATING_LABEL[r]}
            </Opt>
          ))}
        </Sheet>
      )}
    </>,
    document.body
  )
}
