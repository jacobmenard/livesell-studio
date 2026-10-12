import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { Alert, Switch, UploadTile, cx } from '../../components/ui'
import { ACCEPT } from '../../hooks/useMediaLibrary'
import type { MediaItem, SoundRef, SoundSettings } from '../../lib/types'
import { SOUNDS } from '../../stage/catalog'

export interface Pad {
  id: SoundRef
  label: string
  key: string
  color: string
  mediaId?: number
}

export function soundPads(media: MediaItem[]): Pad[] {
  return [
    ...SOUNDS.map((s) => ({ id: s.id, label: s.label, key: s.key, color: s.color })),
    ...media
      .filter((m) => m.kind === 'sound')
      .map((m) => ({ id: `media:${m.id}` as SoundRef, label: m.label, key: '–', color: '#E3DEE8', mediaId: m.id })),
  ]
}

export function SoundBoard({
  pads,
  settings,
  onSettings,
  playing,
  onPlay,
  onUpload,
  uploading,
  onRemove,
  error,
}: {
  pads: Pad[]
  settings: SoundSettings
  onSettings: (patch: Partial<SoundSettings>) => void
  playing: SoundRef | null
  onPlay: (pad: Pad) => void
  onUpload: (file: File) => void
  uploading: boolean
  onRemove: (pad: Pad) => void
  error: string
}) {
  const [confirm, setConfirm] = useState<SoundRef | null>(null)

  return (
    <section aria-labelledby="sounds-h" className="flex flex-col gap-3.5 rounded-[20px] border border-line bg-surface p-[18px]">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-[1_1_200px] flex-col gap-0.5">
          <h2 id="sounds-h" className="m-0 font-display text-xl font-semibold">
            Sound effects
          </h2>
          <span className="text-[13px] text-muted">Tap a pad to play it on your live. The keys on each pad work as shortcuts.</span>
        </div>
        <label className="flex flex-[0_1_200px] flex-col gap-0.5 text-[13px] text-muted">
          Volume {settings.volume}%
          <input type="range" min={0} max={100} value={settings.volume} onChange={(e) => onSettings({ volume: Number(e.target.value) })} />
        </label>
        <div className="flex flex-wrap gap-3.5">
          <Switch checked={settings.to_stream} onChange={(v) => onSettings({ to_stream: v })} label="Send to live" />
          <Switch checked={settings.monitor} onChange={(v) => onSettings({ monitor: v })} label="Hear it myself" />
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(124px, 1fr))' }}>
        {pads.map((s) => (
          <div key={s.id} className="relative">
            <button
              type="button"
              onClick={() => onPlay(s)}
              aria-label={s.key === '–' ? `Play ${s.label}` : `Play ${s.label}, shortcut ${s.key}`}
              className={cx(
                'flex min-h-[84px] w-full flex-col justify-between gap-[18px] rounded-[14px] border-2 p-3 text-left text-text',
                playing === s.id ? 'border-primary bg-raised' : 'border-raised bg-field',
              )}
            >
              <span className="flex items-center justify-between">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                {s.key !== '–' && <span className="min-w-[22px] rounded-md bg-surface-2 px-1.5 py-px text-center font-mono text-xs">{s.key}</span>}
              </span>
              <span className="truncate font-semibold">{s.label}</span>
            </button>
            {s.mediaId !== undefined &&
              (confirm === s.id ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 rounded-[14px] bg-danger-bg p-2 text-center">
                  <span className="text-xs text-danger-text">Remove this sound?</span>
                  <div className="flex gap-1.5">
                    <button type="button" className="rounded-lg border border-line-strong bg-transparent px-2 py-1 text-xs font-semibold text-text" onClick={() => setConfirm(null)}>
                      Keep
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border-0 bg-danger-solid px-2 py-1 text-xs font-semibold text-on-danger"
                      onClick={() => {
                        setConfirm(null)
                        onRemove(s)
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirm(s.id)}
                  aria-label={`Remove sound ${s.label}`}
                  className="absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-lg border-0 bg-surface-2 text-muted hover:text-danger-text"
                >
                  <Icon name="close" size={14} strokeWidth={2.4} />
                </button>
              ))}
          </div>
        ))}
        <UploadTile label="Add your own sound" hint="MP3, WAV, OGG, M4A · max 5 MB" accept={ACCEPT.sound} onFile={onUpload} busy={uploading} className="min-h-[84px]" />
      </div>
    </section>
  )
}
