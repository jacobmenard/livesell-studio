import { Alert, Button, Panel, Segmented, Switch, UploadTile, cx } from '../../components/ui'
import { ACCEPT } from '../../hooks/useMediaLibrary'
import type { ForegroundDock, ForegroundSettings, MediaItem } from '../../lib/types'

const DOCKS: { id: ForegroundDock; label: string }[] = [
  { id: 'top', label: 'Top' },
  { id: 'bottom', label: 'Bottom' },
]

/** The foreground: a full-width image (banner, lower third) docked to the top or bottom of the live. */
export function ForegroundPanel({
  foreground,
  onChange,
  media,
  onUpload,
  uploading,
  error,
}: {
  foreground: ForegroundSettings
  onChange: (patch: Partial<ForegroundSettings>) => void
  media: MediaItem[]
  onUpload: (file: File) => void
  uploading: boolean
  error: string
}) {
  // Foreground images are their own library, apart from popup images.
  const images = media.filter((m) => m.kind === 'foreground')
  const picked = images.some((m) => m.id === foreground.media_id)

  return (
    <Panel title="Foreground image" subtitle="An image across the full width, docked to the top or bottom, in portrait and landscape. It has its own images, separate from popup images." headingId="foreground-h">
      <Switch
        checked={foreground.enabled && picked}
        disabled={!picked}
        onChange={(enabled) => onChange({ enabled })}
        label="Show the foreground on your live"
        description={picked ? 'Popups still show on top of it.' : 'Upload or pick a foreground image below first.'}
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted">Dock it to the</span>
        <Segmented label="Dock the foreground to" size="sm" value={foreground.dock} onChange={(dock) => onChange({ dock })} options={DOCKS} />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {images.map((m) => {
          const on = foreground.media_id === m.id
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={on}
              // Picking an image shows it straight away.
              onClick={() => onChange({ media_id: m.id, enabled: true })}
              className={cx('flex flex-col gap-1.5 rounded-xl border-2 bg-transparent p-[5px] text-left text-text', on ? 'border-select' : 'border-transparent')}
            >
              <span className="ph-stripes relative block aspect-[16/7] w-full overflow-hidden rounded-lg">
                <img src={m.url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-contain" />
              </span>
              <span className="truncate text-xs">{m.label}</span>
            </button>
          )
        })}
        <UploadTile label="Upload foreground" hint="A wide PNG with a see-through background works best · 5 MB" accept={ACCEPT.foreground} onFile={onUpload} busy={uploading} className="min-h-[92px]" />
      </div>

      {error && <Alert>{error}</Alert>}

      {picked && (
        <Button size="sm" variant="ghost" onClick={() => onChange({ media_id: null, enabled: false })}>
          Remove foreground
        </Button>
      )}
    </Panel>
  )
}
