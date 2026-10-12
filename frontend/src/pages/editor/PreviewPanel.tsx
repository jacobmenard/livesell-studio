import type { Scene, SetupDocument } from '../../lib/types'
import { Icon } from '../../components/Icon'
import { Button } from '../../components/ui'
import { BACKGROUND_BY_ID } from '../../stage/catalog'
import type { CompositorStatus } from '../../stage/compositor'
import { EditablePopupLayer, type PopupTransform } from '../../stage/EditablePopupLayer'
import { ForegroundLayer, SafeZones, StageFrame } from '../../stage/Stage'
import { CAMERA_MESSAGES, type CameraStatus } from '../../stage/useCamera'
import { VideoLayer } from '../../stage/VideoLayer'
import { popupText } from '../../stage/look'

const COMPOSITOR_NOTES: Partial<Record<CompositorStatus, string>> = {
  'loading-segmentation': 'Getting background removal ready…',
  'segmentation-unavailable': "Background removal couldn't start in this browser, so viewers see your real room. Try Chrome or Edge, or use Green screen.",
  'chroma-unavailable': "Green screen needs WebGL, which this browser has turned off. Viewers see your camera as is.",
}

export function PreviewPanel({
  doc,
  scene,
  stream,
  cameraStatus,
  onStartCamera,
  compositorStatus,
  onCompositorStatus,
  playingLabel,
  onOpenCleanScreen,
  selectedKey,
  onSelectPopup,
  onChangePopup,
}: {
  doc: SetupDocument
  scene: Scene
  stream: MediaStream | null
  cameraStatus: CameraStatus
  onStartCamera: () => void
  compositorStatus: CompositorStatus
  onCompositorStatus: (s: CompositorStatus) => void
  playingLabel: string | null
  onOpenCleanScreen: () => void
  /** The popup being edited; popups on the preview can be dragged and resized. */
  selectedKey: string | null
  onSelectPopup: (key: string) => void
  onChangePopup: (key: string, patch: PopupTransform) => void
}) {
  const portrait = doc.orientation === 'portrait'
  const bgLabel =
    doc.background.mode === 'none'
      ? 'Your real room'
      : doc.background.mode === 'blur'
        ? 'Blurred room'
        : scene.background.media_url
          ? 'Your photo'
          : BACKGROUND_BY_ID[doc.background.preset]?.label
  const cameraOff = cameraStatus !== 'live'
  const note = COMPOSITOR_NOTES[compositorStatus]

  return (
    <section aria-label="Preview" className="flex flex-col gap-2.5">
      <div className="flex justify-center rounded-[20px] border border-line bg-[#08070A]" style={{ padding: portrait ? 16 : 0 }}>
        <div className="w-full" style={{ maxWidth: portrait ? 340 : undefined }}>
          <StageFrame orientation={doc.orientation} className="rounded-[14px] bg-black text-cream">
            <VideoLayer
              stream={stream}
              orientation={doc.orientation}
              resolution={doc.resolution}
              camera={doc.camera}
              background={scene.background}
              backgroundUrl={scene.background.media_url ?? null}
              onStatus={onCompositorStatus}
            />
            <ForegroundLayer foreground={scene.foreground} />
            <EditablePopupLayer popups={scene.popups} selectedKey={selectedKey} onSelect={onSelectPopup} onChange={onChangePopup} />
            {doc.output_settings.safe_zones && <SafeZones orientation={doc.orientation} />}

            {cameraOff && (
              <div className="absolute inset-x-0 bottom-0 z-[4] flex flex-col items-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-4 pt-10 pb-4 text-center">
                <span className="max-w-md text-sm text-cream">{CAMERA_MESSAGES[cameraStatus]}</span>
                {cameraStatus !== 'starting' && cameraStatus !== 'unsupported' && (
                  <Button variant="primary" onClick={onStartCamera}>
                    <Icon name="camera" />
                    {cameraStatus === 'idle' ? 'Turn on camera' : 'Try again'}
                  </Button>
                )}
              </div>
            )}

            {playingLabel && (
              <div role="status" className="absolute bottom-3.5 left-1/2 z-[5] inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-[rgba(13,12,16,0.88)] px-3.5 py-1.5 text-[13px] font-semibold text-cream">
                <Icon name="music" size={14} />
                Playing: {playingLabel}
              </div>
            )}
          </StageFrame>
        </div>
      </div>

      {note && (
        <p role="status" className="m-0 flex items-start gap-2 text-[13px] text-text-2">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
          {note}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[13px] text-muted">
          Preview · {doc.resolution} · {portrait ? 'Portrait 9:16' : 'Landscape 16:9'} · Background: {bgLabel}
        </p>
        <button type="button" onClick={onOpenCleanScreen} className="inline-flex min-h-9 items-center gap-1.5 border-0 bg-transparent p-0 text-[13px] font-semibold text-link">
          <Icon name="external" size={14} strokeWidth={2.2} />
          Open clean screen
        </button>
      </div>
    </section>
  )
}

export function OnScreenBar({ scene, onHide, onHideAll }: { scene: Scene; onHide: (key: string) => void; onHideAll: () => void }) {
  return (
    <section aria-labelledby="onscreen-h" className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-line bg-surface px-3.5 py-3">
      <h2 id="onscreen-h" className="m-0 text-sm font-semibold text-muted">
        On screen now
      </h2>
      {scene.popups.length === 0 && <span className="text-sm text-muted">Nothing yet. Pick a popup on the right and press Show.</span>}
      {scene.popups.map((p) => {
        const name = popupText(p)
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => onHide(p.key)}
            aria-label={`Hide ${name}`}
            className="inline-flex min-h-9 items-center gap-2 rounded-full border border-line-strong bg-surface-2 pr-2 pl-3 text-[13px] font-semibold text-text"
          >
            {name}
            <Icon name="close" size={14} strokeWidth={2.4} />
          </button>
        )
      })}
      <span className="flex-1" />
      <button
        type="button"
        onClick={onHideAll}
        disabled={scene.popups.length === 0}
        className="min-h-9 rounded-full border border-line-strong bg-transparent px-3.5 text-[13px] font-semibold text-text disabled:opacity-50"
      >
        Hide all
      </button>
    </section>
  )
}
