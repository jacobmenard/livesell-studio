import { useState, type FormEvent } from 'react'
import { Alert, Button, Panel, Segmented, UploadTile, cx } from '../../components/ui'
import { ACCEPT } from '../../hooks/useMediaLibrary'
import type { MediaItem, PopupConfig, SoundRef, TextColor } from '../../lib/types'
import { AUTO_HIDES, DISPLAY_FONT, EFFECTS, ENTRANCES, MAX_TEXT_LENGTH, POPUP_SIZE, POSITIONS, POSITION_NAMES, TEXT_COLORS, effectLabel } from '../../stage/catalog'
import { isFreelyPlaced, popupText, resolveLook } from '../../stage/look'
import type { Pad } from './SoundBoard'

/** The Popups step's own tabs, so each part fits on screen without scrolling. */
export type PopupSection = 'show' | 'add' | 'place' | 'effect' | 'sound'

const SECTIONS: { id: PopupSection; label: string; hint: string }[] = [
  { id: 'show', label: 'Popups', hint: 'Tap Show to put a popup on your live. Tap a popup to pick it for editing.' },
  { id: 'add', label: 'Add', hint: 'Make your own text popup or upload a picture.' },
  { id: 'place', label: 'Place', hint: 'Where the popup shows, how big it is, and how it comes in.' },
  { id: 'effect', label: 'Effect', hint: 'Fireworks, confetti and more, and when it hides by itself.' },
  { id: 'sound', label: 'Sound', hint: 'A sound that plays when the popup shows.' },
]

/** Tabs that change the popup picked in the grid. */
const EDIT_SECTIONS: PopupSection[] = ['place', 'effect', 'sound']

export function PopupsPanel({
  popups,
  activeKeys,
  selectedKey,
  section,
  onSection,
  onSelect,
  onToggle,
  onChange,
  onRemove,
  onAddText,
  onUploadImage,
  uploading,
  error,
  media,
  pads,
}: {
  popups: PopupConfig[]
  activeKeys: Set<string>
  selectedKey: string | null
  section: PopupSection
  onSection: (section: PopupSection) => void
  onSelect: (key: string) => void
  onToggle: (key: string) => void
  onChange: (key: string, patch: Partial<PopupConfig>) => void
  onRemove: (key: string) => void
  onAddText: (text: string, color: TextColor) => string | undefined
  onUploadImage: (file: File) => void
  uploading: boolean
  error: string
  media: MediaItem[]
  pads: Pad[]
}) {
  const urls = new Map(media.map((m) => [m.id, m.url]))
  const selected = popups.find((p) => p.key === selectedKey) ?? null
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]
  // A dot on a tab that has something set for the picked popup.
  const active: Partial<Record<PopupSection, boolean>> = { effect: !!selected && selected.effect !== 'none', sound: !!selected?.sound }

  return (
    <Panel title="Popups" headingId="pop-h">
      <div className="flex flex-col gap-1.5">
        <Segmented
          label="Popup settings"
          size="sm"
          columns={SECTIONS.length}
          value={current.id}
          onChange={onSection}
          options={SECTIONS.map((s) => ({
            id: s.id,
            label: (
              <span className="inline-flex items-center gap-1">
                {s.label}
                {active[s.id] && (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                    <span className="sr-only">(on)</span>
                  </>
                )}
              </span>
            ),
          }))}
        />
        <p className="m-0 text-[13px] text-muted">{current.hint}</p>
      </div>

      {current.id === 'show' && (
        <>
          <PopupGrid popups={popups} activeKeys={activeKeys} selectedKey={selectedKey} urls={urls} onSelect={onSelect} onToggle={onToggle} />
          {selected && (
            <p className="m-0 text-[13px] text-muted">
              Picked: <strong className="text-text">{popupText(selected)}</strong>. Change it in{' '}
              {EDIT_SECTIONS.map((id, i) => (
                <span key={id}>
                  {i > 0 && (i === EDIT_SECTIONS.length - 1 ? ' or ' : ', ')}
                  <button type="button" onClick={() => onSection(id)} className="border-0 bg-transparent p-0 font-semibold text-link">
                    {SECTIONS.find((s) => s.id === id)?.label}
                  </button>
                </span>
              ))}
              .
            </p>
          )}
        </>
      )}

      {current.id === 'add' && <AddPopup onAddText={onAddText} onUploadImage={onUploadImage} uploading={uploading} error={error} />}

      {EDIT_SECTIONS.includes(current.id) &&
        (selected ? (
          <>
            <EditingBar
              popup={selected}
              url={selected.media_id ? urls.get(selected.media_id) : undefined}
              on={activeKeys.has(selected.key)}
              onToggle={() => onToggle(selected.key)}
              onRemove={() => onRemove(selected.key)}
              onPickAnother={() => onSection('show')}
            />
            {current.id === 'place' && <PlaceControls popup={selected} on={activeKeys.has(selected.key)} onChange={(patch) => onChange(selected.key, patch)} />}
            {current.id === 'effect' && <EffectControls popup={selected} onChange={(patch) => onChange(selected.key, patch)} />}
            {current.id === 'sound' && <SoundControls popup={selected} pads={pads} onChange={(patch) => onChange(selected.key, patch)} />}
          </>
        ) : (
          <div className="flex flex-col items-start gap-2 rounded-xl bg-surface-2 p-3.5">
            <p className="m-0 text-sm text-text-2">Pick a popup first, then change it here.</p>
            <Button size="sm" variant="primary" onClick={() => onSection('show')}>
              Pick a popup
            </Button>
          </div>
        ))}
    </Panel>
  )
}

function PopupGrid({
  popups,
  activeKeys,
  selectedKey,
  urls,
  onSelect,
  onToggle,
}: {
  popups: PopupConfig[]
  activeKeys: Set<string>
  selectedKey: string | null
  urls: Map<number, string>
  onSelect: (key: string) => void
  onToggle: (key: string) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {popups.map((p) => {
        const on = activeKeys.has(p.key)
        const isSelected = p.key === selectedKey
        const name = popupText(p)
        return (
          <div key={p.key} className={cx('flex flex-col overflow-hidden rounded-[14px] border-2 bg-field', isSelected ? 'border-select' : 'border-line')}>
            <button
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(p.key)}
              aria-label={`Edit ${name}`}
              className="relative grid h-[78px] place-items-center border-0 bg-transparent p-1.5 text-text"
            >
              <MiniPopup popup={p} url={p.media_id ? urls.get(p.media_id) : undefined} />
              {p.effect !== 'none' && <span className="absolute top-1.5 left-1.5 rounded-[5px] bg-raised px-1.5 py-px text-[10px] font-semibold text-text">{effectLabel(p.effect)}</span>}
              {on && <span className="absolute top-1.5 right-1.5 rounded-[5px] bg-success px-1.5 py-px font-mono text-[10px] tracking-[0.06em] text-navy">ON</span>}
            </button>
            <button
              type="button"
              onClick={() => onToggle(p.key)}
              aria-label={`${on ? 'Hide' : 'Show'} ${name}`}
              className={cx('min-h-[34px] border-0 border-t border-line text-xs font-semibold', on ? 'bg-success text-navy' : 'bg-surface text-text')}
            >
              {on ? 'Hide' : 'Show'}
            </button>
          </div>
        )
      })}
    </div>
  )
}

/** A text popup or an uploaded picture; the new popup is then picked in the grid. */
function AddPopup({
  onAddText,
  onUploadImage,
  uploading,
  error,
}: {
  onAddText: (text: string, color: TextColor) => string | undefined
  onUploadImage: (file: File) => void
  uploading: boolean
  error: string
}) {
  const [draft, setDraft] = useState('')
  const [color, setColor] = useState<TextColor>('yellow')
  const [draftError, setDraftError] = useState('')

  const addText = (e: FormEvent) => {
    e.preventDefault()
    const problem = onAddText(draft, color)
    if (problem) {
      setDraftError(problem)
      return
    }
    setDraft('')
    setDraftError('')
  }

  return (
    <>
      <form onSubmit={addText} className="flex flex-col gap-2">
        <label htmlFor="custom-text" className="text-[13px] text-muted">
          Make a text popup
        </label>
        <div className="flex gap-2">
          <input
            id="custom-text"
            type="text"
            maxLength={MAX_TEXT_LENGTH}
            value={draft}
            onChange={(e) => (setDraft(e.target.value), setDraftError(''))}
            placeholder="e.g. ₱99 ONLY"
            aria-invalid={draftError ? true : undefined}
            aria-describedby={draftError ? 'custom-text-err' : undefined}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-field px-3 text-text placeholder:text-muted"
          />
          <Button type="submit" variant="primary">
            Add
          </Button>
        </div>
        {draftError && (
          <p id="custom-text-err" className="m-0 text-xs text-danger-text">
            {draftError}
          </p>
        )}
        <span className="text-[13px] text-muted">Color</span>
        <div role="group" aria-label="Popup color" className="flex gap-2">
          {TEXT_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={c.id === color}
              aria-label={c.name}
              onClick={() => setColor(c.id)}
              className={cx('h-9 w-9 rounded-[10px] border-2 p-0', c.id === color ? 'border-inverse-bg' : 'border-transparent')}
              style={{ backgroundColor: c.bg }}
            />
          ))}
        </div>
      </form>

      <div className="flex flex-col gap-2 border-t border-line pt-3.5">
        <span className="text-[13px] text-muted">Or use a picture</span>
        <UploadTile label="Upload image" hint="PNG with see-through background works best" accept={ACCEPT.image} onFile={onUploadImage} busy={uploading} className="min-h-24" />
        {error && <Alert>{error}</Alert>}
      </div>
    </>
  )
}

/** Which popup the Place / Effect / Sound tabs are changing, with Show / Hide at hand. */
function EditingBar({
  popup,
  url,
  on,
  onToggle,
  onRemove,
  onPickAnother,
}: {
  popup: PopupConfig
  url?: string
  on: boolean
  onToggle: () => void
  onRemove: () => void
  onPickAnother: () => void
}) {
  const custom = popup.kind !== 'preset'
  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-xl bg-surface-2 p-2.5">
      <span className="grid h-16 w-24 shrink-0 place-items-center overflow-hidden rounded-lg bg-field p-1">
        <MiniPopup popup={popup} url={url} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="text-xs text-muted">Editing</span>
        <span className="truncate text-sm font-semibold">{popupText(popup)}</span>
        <button type="button" onClick={onPickAnother} className="self-start border-0 bg-transparent p-0 text-xs font-semibold text-link">
          Pick another
        </button>
      </span>
      <Button size="sm" variant={on ? 'secondary' : 'primary'} onClick={onToggle}>
        {on ? 'Hide' : 'Show'}
      </Button>
      {custom && (
        <Button size="sm" variant="ghost" className="text-danger-text" onClick={onRemove}>
          Delete
        </Button>
      )}
    </div>
  )
}

function PlaceControls({ popup, on, onChange }: { popup: PopupConfig; on: boolean; onChange: (patch: Partial<PopupConfig>) => void }) {
  const moved = isFreelyPlaced(popup)
  return (
    <>
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-muted">{moved ? 'Position: moved by hand' : 'Position'}</span>
          <div role="group" aria-label="Position" className="grid w-[132px] grid-cols-3 gap-1 rounded-xl bg-field p-1">
            {POSITIONS.map((pos) => {
              const isOn = !moved && pos === popup.position
              return (
                <button
                  key={pos}
                  type="button"
                  aria-pressed={isOn}
                  aria-label={`${POSITION_NAMES[pos[0]]} ${POSITION_NAMES[pos[1]]}`}
                  // Picking a spot snaps a dragged popup back to the grid.
                  onClick={() => onChange({ position: pos, x: null, y: null })}
                  className={cx('grid h-9 place-items-center rounded-[7px] border-0 p-0', isOn ? 'bg-raised' : 'bg-transparent')}
                >
                  <span className={cx('h-2 w-2 rounded-[2px]', isOn ? 'bg-primary' : 'bg-line-strong')} />
                </button>
              )
            })}
          </div>
        </div>
        <div className="flex flex-[1_1_180px] flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2 text-[13px] text-muted">
            <span>Size</span>
            <span className="flex items-center gap-2">
              <span className="font-semibold text-text">{popup.size}%</span>
              {popup.size !== POPUP_SIZE.default && (
                <button type="button" onClick={() => onChange({ size: POPUP_SIZE.default })} className="border-0 bg-transparent p-0 text-xs font-semibold text-link">
                  Reset
                </button>
              )}
            </span>
          </div>
          <p className="m-0 text-xs text-muted">
            {on
              ? 'Drag it on the preview to move it; drag a corner or a side to resize, up to the full screen width. Or click it and use the arrow keys and + / −.'
              : 'Show it on screen, then drag it on the preview to move it and drag a corner or a side to resize.'}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted">How it comes in</span>
        <Segmented label="Entrance animation" size="sm" value={popup.entrance} onChange={(v) => onChange({ entrance: v })} options={ENTRANCES} />
      </div>
    </>
  )
}

function EffectControls({ popup, onChange }: { popup: PopupConfig; onChange: (patch: Partial<PopupConfig>) => void }) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] text-muted">Effect</span>
        <div role="group" aria-label="Effect" className="flex flex-wrap gap-1.5">
          {EFFECTS.map((fx) => {
            const isOn = fx.id === popup.effect
            return (
              <button
                key={fx.id}
                type="button"
                aria-pressed={isOn}
                // Suggest the matching sound only when the seller hasn't picked one yet.
                onClick={() => onChange(!popup.sound && fx.sound ? { effect: fx.id, sound: fx.sound } : { effect: fx.id })}
                className={cx('min-h-9 rounded-full border px-3 text-[13px] font-semibold', isOn ? 'border-primary bg-primary text-white' : 'border-line-strong bg-transparent text-text')}
              >
                {fx.label}
              </button>
            )
          })}
        </div>
        {popup.effect !== 'none' && (
          <Segmented
            label="Effect plays"
            size="sm"
            value={popup.effect_repeat}
            onChange={(v) => onChange({ effect_repeat: v })}
            options={[
              { id: 'once', label: 'Play once' },
              { id: 'loop', label: 'Keep playing' },
            ]}
          />
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted">Hide by itself after</span>
        <Segmented label="Auto hide" size="sm" value={popup.auto_hide} onChange={(v) => onChange({ auto_hide: v })} options={AUTO_HIDES} />
      </div>
    </>
  )
}

function SoundControls({ popup, pads, onChange }: { popup: PopupConfig; pads: Pad[]; onChange: (patch: Partial<PopupConfig>) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] text-muted">Play a sound when it shows</span>
      <div role="group" aria-label="Sound when popup shows" className="flex flex-wrap gap-1.5">
        {[{ id: null as SoundRef | null, label: 'No sound' }, ...pads.map((p) => ({ id: p.id as SoundRef | null, label: p.label }))].map((s) => {
          const isOn = s.id === popup.sound
          return (
            <button
              key={s.id ?? 'none'}
              type="button"
              aria-pressed={isOn}
              onClick={() => onChange({ sound: s.id })}
              className={cx('min-h-[34px] rounded-full border px-3 text-[13px] font-semibold', isOn ? 'border-inverse-bg bg-inverse-bg text-inverse-fg' : 'border-line-strong bg-transparent text-text')}
            >
              {s.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function MiniPopup({ popup, url }: { popup: PopupConfig; url?: string }) {
  if (popup.kind === 'image') {
    return url ? <img src={url} alt="" className="max-h-16 max-w-full" /> : <span className="text-xs text-muted">Missing image</span>
  }
  const look = resolveLook(popup)
  const circle = look.shape === 'circle'
  return (
    <span
      className="grid max-w-full place-items-center overflow-hidden leading-none font-extrabold whitespace-nowrap"
      style={{
        fontSize: 12,
        fontFamily: DISPLAY_FONT,
        backgroundColor: look.bg,
        color: look.fg,
        border: look.border,
        borderRadius: look.shape === 'tag' ? '0.28em' : 999,
        padding: circle ? 0 : '0.42em 0.8em',
        width: circle ? '3.2em' : 'auto',
        height: circle ? '3.2em' : 'auto',
        transform: `rotate(${look.rot})`,
      }}
    >
      {look.text}
    </span>
  )
}
