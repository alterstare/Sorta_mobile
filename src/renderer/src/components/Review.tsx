// 검토 (phone): ↶ ↷ … ✕ on top, the characters already recognized under it,
// the picture (swipe left = 건너뛰기, swipe right = 확정), then 직접 입력, the
// candidates (함께 있을 수 있는 캐릭터 — 2.5 rows, scroll for more), 등급,
// 단체 사진 / 캐릭터 아닌 그림 and 현재 옵션으로 확정.
// 등급 확인 is the same screen with the three ratings instead.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { useStore } from '../store'
import { useKept } from '../keep'
import { useSwipe } from '../touch'
import type { Rating, ReviewItem } from '../../../shared/types'
import CharacterPicker from './CharacterPicker'
import type { PickedCharacter } from './CharacterPicker'
import { CheckIcon, CloseIcon, GroupsIcon, PersonOffIcon, RedoIcon, SkipNextIcon, UndoIcon } from './icons'
import { RATING_LABEL, safeMode } from './ThumbGrid'

type R = Exclude<Rating, 'unknown'>
const RATINGS: R[] = ['general', 'sensitive', 'r18']
const RATING_DESC: Record<R, string> = {
  general: '누구나 볼 수 있는 그림',
  sensitive: '노출이 있거나 선정적이지만 성인물은 아닌 그림 (수영복 등)',
  r18: '성인 전용'
}

export default function Review(): JSX.Element {
  const kind = useStore((s) => s.reviewKind)
  const setView = useStore((s) => s.setView)
  const showToast = useStore((s) => s.showToast)
  const settings = useStore((s) => s.settings)
  const libraryVersion = useStore((s) => s.libraryVersion)
  const [items, setItems] = useKept<ReviewItem[]>(`review.items.${kind}`, [])
  const [index, setIndex] = useKept(`review.index.${kind}`, 0)
  const [choicesFor, setChoicesFor] = useKept<number | null>('review.choicesFor', null)
  const [checked, setChecked] = useKept<Set<number>>('review.checked', new Set())
  const [extras, setExtras] = useKept<PickedCharacter[]>('review.extras', [])
  const [rating, setRating] = useKept<R>('review.rating', 'general')
  const [outfit, setOutfit] = useKept<Record<number, 'replace' | 'both'>>('review.outfit', {})
  const [removed, setRemoved] = useKept<Set<number>>('review.removed', new Set())
  const [newMode, setNewMode] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [dx, setDx] = useState(0)
  const [leaving, setLeaving] = useState<'left' | 'right' | null>(null)
  const item = items[Math.min(index, items.length - 1)] as ReviewItem | undefined

  const load = useCallback(async () => setItems(await window.api.reviewQueue(kind)), [kind, setItems])
  useEffect(() => {
    void load()
  }, [load, libraryVersion])
  useEffect(() => {
    setNewMode(false)
    setRevealed(false)
    if ((item?.id ?? null) === choicesFor) return
    setChoicesFor(item?.id ?? null)
    setChecked(new Set())
    setExtras([])
    setOutfit({})
    setRemoved(new Set())
    setRating(item && item.rating !== 'unknown' ? item.rating : 'general')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id])

  const toggle = (id: number): void =>
    setChecked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const isSwap = (c: ReviewItem['candidates'][number]): boolean => checked.has(c.id) && !!c.relatedTo && (outfit[c.id] ?? 'replace') === 'replace'
  const kept = (): number[] => {
    const replaced = new Set((item?.candidates ?? []).filter(isSwap).map((c) => c.relatedTo!.id))
    return (item?.confirmed ?? []).filter((c) => !removed.has(c.id) && !replaced.has(c.id)).map((c) => c.id)
  }
  const extra = !!item && item.confirmed.length > 0

  // 현재 옵션으로 확정: the kept characters + the picked ones (nothing picked
  // and nothing recognized → the top candidate), with the chosen rating.
  const confirm = async (): Promise<boolean> => {
    if (!item) return false
    if (kind === 'rating') {
      await window.api.setRating([item.id], rating)
      return true
    }
    let chosen = [...checked, ...extras.map((e) => e.id)]
    if (!chosen.length && !extra && item.candidates[0]) chosen = [item.candidates[0].id]
    const all = [...new Set([...kept(), ...chosen])]
    if (!all.length) {
      showToast({ ok: false, message: '캐릭터를 골라 주세요 (후보를 누르거나 직접 입력)' })
      return false
    }
    await window.api.decide(item.id, all, item.rating !== rating ? rating : null)
    return true
  }
  const skip = (d = 1): void => setIndex((i) => Math.max(0, Math.min(items.length - 1, i + d)))
  const markOther = (): void => {
    if (item) void window.api.markOther([item.id])
  }
  const markGroup = (): void => {
    if (!item) return
    const suggest = item.confirmed[0]?.series ?? item.candidates[0]?.series ?? null
    useStore.getState().setGroupShotDialog({ ids: [item.id], suggest })
  }

  // Swipe: the picture flies off to that side, then the action runs.
  const stageRef = useRef<HTMLDivElement>(null)
  const fly = (side: 'left' | 'right', fn: () => Promise<unknown> | void): void => {
    setLeaving(side)
    window.setTimeout(() => {
      void Promise.resolve(fn()).finally(() => setLeaving(null))
    }, 160)
  }
  useSwipe(stageRef, {
    enabled: !!item,
    onMove: setDx,
    onLeft: () => {
      if (index < items.length - 1) fly('left', () => skip(1))
      else showToast({ ok: true, message: '마지막 그림입니다' })
    },
    onRight: () => {
      const keep = items.length
      fly('right', async () => {
        if ((await confirm()) && keep === 1) showToast({ ok: true, message: '검토를 모두 마쳤습니다' })
      })
    }
  })

  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  useEffect(() => {
    setCanUndo(window.api.canUndo())
    setCanRedo(window.api.canRedo())
  }, [libraryVersion])

  const blur = !!item && safeMode({ rating: item.rating } as Parameters<typeof safeMode>[0], settings) === 'blur' && !revealed
  const swipeHint = dx > 40 ? 'ok' : dx < -40 ? 'skip' : null
  return (
    <div className="m-review">
      <div className="review-top">
        <div className="flat-group">
          <button className="mini icon" title="되돌리기" disabled={!canUndo} onClick={() => void useStore.getState().undo()}>
            <UndoIcon />
          </button>
          <button className="mini icon" title="다시 실행" disabled={!canRedo} onClick={() => void useStore.getState().redo()}>
            <RedoIcon />
          </button>
        </div>
        <span className="review-pos">
          {kind === 'rating' ? '등급 확인' : '캐릭터 검토'}
          {item ? ` · ${Math.min(index, items.length - 1) + 1} / ${items.length}` : ''}
        </span>
        <button className="icon-btn" title="닫기" onClick={() => setView('library')}>
          <CloseIcon />
        </button>
      </div>

      {!item ? (
        <div className="empty">
          <CheckIcon />
          <p>{kind === 'character' ? '검토할 캐릭터가 없습니다.' : '확인할 등급이 없습니다.'}</p>
        </div>
      ) : (
        <>
          {kind === 'character' && (
            <div className="review-auto chip-row">
              {extra ? (
                item.confirmed.map((c) => (
                  <span key={c.id} className={`tag-chip confirmed ${removed.has(c.id) ? 'struck' : ''}`}>
                    {c.name}
                    <button
                      title={removed.has(c.id) ? '되살리기' : '이 캐릭터 빼기'}
                      onClick={() =>
                        setRemoved((r) => {
                          const n = new Set(r)
                          if (n.has(c.id)) n.delete(c.id)
                          else n.add(c.id)
                          return n
                        })
                      }
                    >
                      {removed.has(c.id) ? <UndoIcon /> : <CloseIcon />}
                    </button>
                  </span>
                ))
              ) : (
                <span className="dim">자동으로 인식된 캐릭터가 없습니다. 아래 후보에서 고르세요.</span>
              )}
            </div>
          )}

          <div
            ref={stageRef}
            className={`review-stage ${leaving ? `leave-${leaving}` : ''} ${swipeHint ? `hint-${swipeHint}` : ''}`}
            onClick={() => blur && setRevealed(true)}
          >
            <img
              key={item.id}
              className={`review-img ${blur ? 'blur' : ''}`}
              style={dx ? { transform: `translateX(${dx}px) rotate(${dx / 40}deg)`, transition: 'none' } : undefined}
              src={item.path ? window.api.imageUrl(item.path) : window.api.thumbUrl(item.thumb ?? '', '')}
              onError={(e) => {
                const el = e.currentTarget
                const t = window.api.thumbUrl(item.thumb ?? '', '')
                if (el.src !== t) el.src = t
              }}
              draggable={false}
            />
            {swipeHint && <span className={`swipe-label ${swipeHint}`}>{swipeHint === 'ok' ? '확정' : '건너뛰기'}</span>}
          </div>

          <div className="review-bottom">
            {kind === 'character' ? (
              <>
                <CharacterPicker
                  placeholder={extra ? '다른 캐릭터가 있으면 직접 입력' : '목록에 없으면 직접 입력'}
                  newMode={newMode}
                  onNewModeChange={setNewMode}
                  onPick={(c) => setExtras((x) => (x.some((y) => y.id === c.id) ? x : [...x, c]))}
                />
                {extras.length > 0 && (
                  <div className="chip-row">
                    {extras.map((c) => (
                      <span key={c.id} className="tag-chip">
                        {c.name} · {c.series}
                        <button title="빼기" onClick={() => setExtras((x) => x.filter((y) => y.id !== c.id))}>
                          <CloseIcon />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="review-label">{extra ? '함께 있을 수 있는 캐릭터' : '후보'}</div>
                <div className="cand-list">
                  {item.candidates.map((c) => (
                    <button key={c.id} className={`cand ${checked.has(c.id) ? 'on' : ''}`} onClick={() => toggle(c.id)}>
                      <span className="cand-main">
                        <span className="cand-name">
                          {c.name}
                          {c.low && <span className="cand-low">낮은 확신</span>}
                        </span>
                        <span className="cand-meta">
                          {c.relatedTo ? `${c.relatedTo.name}의 다른 복장 · ` : ''}
                          {c.series} · {Math.round(c.score * 100)}%
                        </span>
                        {c.relatedTo && checked.has(c.id) && (
                          <span className="outfit-choice" onClick={(e) => e.stopPropagation()}>
                            {(['replace', 'both'] as const).map((m) => (
                              <span
                                key={m}
                                role="radio"
                                aria-checked={(outfit[c.id] ?? 'replace') === m}
                                className={`outfit-opt ${(outfit[c.id] ?? 'replace') === m ? 'on' : ''}`}
                                onClick={() => setOutfit((o) => ({ ...o, [c.id]: m }))}
                              >
                                {m === 'replace' ? '이 복장으로 변경' : '둘 다 포함'}
                              </span>
                            ))}
                          </span>
                        )}
                      </span>
                      {c.refs.length > 0 && (
                        <span className="cand-refs">
                          {c.refs.map((r) => (
                            <img key={r} src={window.api.imageUrl(r)} draggable={false} />
                          ))}
                        </span>
                      )}
                      <span className="cand-check">{checked.has(c.id) && <CheckIcon />}</span>
                    </button>
                  ))}
                  {item.candidates.length === 0 && <div className="row-desc">후보가 없습니다. 직접 입력하세요.</div>}
                </div>
                <div className="flat-group review-row">
                  {RATINGS.map((r) => (
                    <button key={r} className={`mini ${rating === r ? 'on' : ''}`} onClick={() => setRating(r)}>
                      {RATING_LABEL[r]}
                    </button>
                  ))}
                </div>
                <div className="flat-group review-row">
                  <button className="mini" onClick={markGroup}>
                    <GroupsIcon />
                    단체 사진
                  </button>
                  <button className="mini" onClick={markOther}>
                    <PersonOffIcon />
                    캐릭터 아닌 그림
                  </button>
                  <button className="mini" onClick={() => skip()}>
                    <SkipNextIcon />
                    건너뛰기
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="review-q-sub">
                  모델이 경계에 걸려 확실하지 않습니다{item.ratingScore !== null && ` (모델 점수 ${Math.round(item.ratingScore * 100)}%)`}. 맞는 등급을 고르세요.
                </div>
                <div className="cand-list rating">
                  {RATINGS.map((r) => (
                    <button key={r} role="radio" aria-checked={rating === r} className={`cand radio ${rating === r ? 'on' : ''}`} onClick={() => setRating(r)}>
                      <span className="cand-main">
                        <span className="cand-name">{RATING_LABEL[r]}</span>
                        <span className="cand-meta">{RATING_DESC[r]}</span>
                      </span>
                      <span className={`radio-dot ${rating === r ? 'on' : ''}`} />
                    </button>
                  ))}
                </div>
              </>
            )}
            <button className="btn primary review-confirm" onClick={() => void confirm()}>
              <CheckIcon />
              현재 옵션으로 확정
            </button>
          </div>
        </>
      )}
    </div>
  )
}
