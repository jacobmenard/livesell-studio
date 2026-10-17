import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { Alert, Button, Panel, Segmented, UploadTile, cx } from '../../components/ui'
import { ACCEPT } from '../../hooks/useMediaLibrary'
import type { BackgroundSettings, MediaItem } from '../../lib/types'
import { BACKGROUND_MODES, BACKGROUND_PRESETS, KEY_COLORS } from '../../stage/catalog'

export function BackgroundPanel({
  background,
  onChange,
  media,
  onUpload,
  onRemove,
  uploading,
  error,
}: {
  background: BackgroundSettings
  onChange: (patch: Partial<BackgroundSettings>) => void
  media: MediaItem[]
  onUpload: (file: File) => void
  /** Deletes one of the seller's own photos (setups using it go back to their built-in background). */
  onRemove: (mediaId: number) => Promise<void>
  uploading: boolean
  error: string
}) {
  const mode = BACKGROUND_MODES.find((m) => m.id === background.mode) ?? BACKGROUND_MODES[2]
  const showPicker = background.mode === 'image' || background.mode === 'green'
  const ownPhotos = media.filter((m) => m.kind === 'background')
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [removingId, setRemovingId] = useState<number | null>(null)

  const remove = async (id: number) => {
    setRemovingId(id)
    try {
      await onRemove(id)
    } finally {
      setRemovingId(null)
      setConfirmId(null)
    }
  }

  return (
    <Panel title="Background" headingId="bg-h">
      <Segmented label="Background mode" size="sm" columns={4} value={background.mode} onChange={(id) => onChange({ mode: id })} options={BACKGROUND_MODES.map((m) => ({ id: m.id, label: m.label }))} />
      <p className="m-0 text-[13px] text-muted">{mode.help}</p>

      {showPicker && (
        <div className="grid grid-cols-3 gap-2.5">
          {BACKGROUND_PRESETS.map((b) => {
            const on = background.media_id === null && background.preset === b.id
            return (
              <Tile key={b.id} label={b.label} src={b.src} tone={b.tone} on={on} onPick={() => onChange({ preset: b.id, media_id: null })} />
            )
          })}
          {ownPhotos.map((m) =>
            confirmId === m.id ? (
              <div key={m.id} role="group" aria-label={`Delete ${m.label}?`} className="flex flex-col justify-between gap-1.5 rounded-xl bg-danger-bg p-2">
                <span className="text-xs font-semibold text-danger-text">Delete this photo?</span>
                <span className="text-[11px] text-danger-text">Setups using it go back to a built-in background.</span>
                <span className="flex flex-wrap gap-1">
                  <Button size="sm" variant="danger" className="min-h-8 px-2.5 text-xs" loading={removingId === m.id} onClick={() => void remove(m.id)}>
                    Delete
                  </Button>
                  <Button size="sm" variant="ghost" className="min-h-8 px-2.5 text-xs" disabled={removingId === m.id} onClick={() => setConfirmId(null)}>
                    Keep
                  </Button>
                </span>
              </div>
            ) : (
              <div key={m.id} className="relative">
                <Tile label={m.label} src={m.url} tone="#17151C" on={background.media_id === m.id} onPick={() => onChange({ media_id: m.id })} />
                <button
                  type="button"
                  onClick={() => setConfirmId(m.id)}
                  aria-label={`Delete ${m.label}`}
                  title="Delete photo"
                  className="absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-full border-0 bg-black/65 text-white transition-[transform,background-color] duration-150 hover:bg-danger-solid active:scale-90 motion-reduce:transition-none"
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ),
          )}
          <UploadTile label="Upload photo" hint="PNG, JPG, WEBP or GIF (moving pictures play) · 5 MB" accept={ACCEPT.background} onFile={onUpload} busy={uploading} className="min-h-[92px]" />
        </div>
      )}

      {error && <Alert>{error}</Alert>}

      {background.mode === 'green' && (
        <div className="flex flex-col gap-3 border-t border-line pt-3.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="flex-1 text-[13px] text-muted">Screen color behind you</span>
            {KEY_COLORS.map((k) => {
              const on = background.key_color === k.id
              return (
                <button
                  key={k.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange({ key_color: k.id })}
                  className={cx('inline-flex min-h-9 items-center gap-1.5 rounded-full border-2 bg-transparent px-3 text-[13px] text-text', on ? 'border-select' : 'border-track-off')}
                >
                  <span className="h-3.5 w-3.5 rounded" style={{ backgroundColor: k.swatch }} />
                  {k.label}
                </button>
              )
            })}
          </div>
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            Similarity
            <input type="range" min={0} max={100} value={background.similarity} onChange={(e) => onChange({ similarity: Number(e.target.value) })} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            Edge smoothness
            <input type="range" min={0} max={100} value={background.smoothness} onChange={(e) => onChange({ smoothness: Number(e.target.value) })} />
          </label>
        </div>
      )}
    </Panel>
  )
}

function Tile({ label, src, tone, on, onPick }: { label: string; src: string; tone: string; on: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onPick}
      className={cx('flex flex-col gap-1.5 rounded-xl border-2 bg-transparent p-[5px] text-left text-text', on ? 'border-select' : 'border-transparent')}
    >
      <span className="relative block aspect-[16/10] w-full overflow-hidden rounded-lg" style={{ backgroundColor: tone }}>
        <img src={src} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      </span>
      <span className="truncate px-0.5 text-xs font-medium">{label}</span>
    </button>
  )
}
