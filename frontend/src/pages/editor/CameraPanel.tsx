import { Icon } from '../../components/Icon'
import { Button, Panel, Segmented, Switch, cx } from '../../components/ui'
import type { CameraSettings, Orientation, Resolution } from '../../lib/types'
import { MIN_ZOOM } from '../../stage/geometry'
import { AUDIO_MESSAGES, CAMERA_MESSAGES, type AudioStatus, type CameraDevice, type CameraStatus } from '../../stage/useCamera'

export function CameraPanel({
  camera,
  orientation,
  resolution,
  onCamera,
  onOrientation,
  onResolution,
  devices,
  deviceId,
  status,
  audioStatus,
  micLabel,
  onSelectDevice,
  onStart,
  onStop,
}: {
  camera: CameraSettings
  orientation: Orientation
  resolution: Resolution
  onCamera: (patch: Partial<CameraSettings>) => void
  onOrientation: (o: Orientation) => void
  onResolution: (r: Resolution) => void
  devices: CameraDevice[]
  deviceId: string | null
  status: CameraStatus
  audioStatus: AudioStatus
  micLabel: string | null
  onSelectDevice: (id: string) => void
  onStart: () => void
  onStop: () => void
}) {
  const live = status === 'live'
  const phone = camera.source === 'phone'

  return (
    <Panel title="Camera" headingId="cam-h">
      <div role="radiogroup" aria-label="Camera source" className="flex flex-col gap-2">
        {(
          [
            { id: 'camera', label: 'Camera on this computer', sub: 'Webcam, HDMI capture card or streaming box' },
            { id: 'phone', label: 'Phone camera', sub: 'Use your phone as a webcam' },
          ] as const
        ).map((c) => {
          const on = camera.source === c.id
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onCamera({ source: c.id })}
              className={cx('flex min-h-14 items-center gap-3 rounded-[14px] border-2 bg-field px-3.5 py-2.5 text-left text-text', on ? 'border-select' : 'border-line')}
            >
              <span className={cx('grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-2', on ? 'border-select' : 'border-line')}>
                <span className={cx('h-2 w-2 rounded-full', on ? 'bg-select' : 'bg-transparent')} />
              </span>
              <span className="flex flex-1 flex-col leading-tight">
                <span className="font-semibold">{c.label}</span>
                <span className="text-[13px] text-muted">{c.sub}</span>
              </span>
            </button>
          )
        })}
      </div>

      {phone && (
        <p className="m-0 rounded-xl border border-line-strong bg-surface-2 px-3.5 py-2.5 text-[13px] text-text-2">
          Install a phone-webcam app (like the ones that come with many phones, or DroidCam / Camo) so your phone shows up as a camera on this computer, then pick it
          below. Built-in QR pairing is coming in a later version.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="camera-device" className="text-[13px] text-muted">
          Which camera
        </label>
        <div className="flex gap-2">
          <select
            id="camera-device"
            value={deviceId ?? ''}
            disabled={devices.length === 0}
            onChange={(e) => e.target.value && onSelectDevice(e.target.value)}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-field px-3 text-text disabled:opacity-60"
          >
            {devices.length === 0 && <option value="">Turn the camera on to see your cameras</option>}
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
          {live ? (
            <Button onClick={onStop}>Turn off</Button>
          ) : (
            <Button variant="primary" onClick={onStart} loading={status === 'starting'}>
              <Icon name="camera" />
              Turn on
            </Button>
          )}
        </div>
        <p role="status" className={cx('m-0 text-[13px]', live ? 'text-select' : status === 'idle' || status === 'starting' ? 'text-muted' : 'text-danger-text')}>
          {CAMERA_MESSAGES[status]}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted">Shape</span>
        <Segmented
          label="Shape"
          value={orientation}
          onChange={onOrientation}
          options={[
            { id: 'landscape', label: 'Landscape 16:9' },
            { id: 'portrait', label: 'Portrait 9:16' },
          ]}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted">Quality</span>
        <Segmented
          label="Quality"
          value={resolution}
          onChange={onResolution}
          options={[
            { id: '720p', label: '720p' },
            { id: '1080p', label: '1080p' },
          ]}
        />
      </div>
      <label className="flex flex-col gap-1 text-[13px] text-muted">
        Brightness
        <input type="range" min={0} max={100} value={camera.brightness} onChange={(e) => onCamera({ brightness: Number(e.target.value) })} />
      </label>
      <label className="flex flex-col gap-1 text-[13px] text-muted">
        Zoom
        <input
          type="range"
          min={MIN_ZOOM[orientation]}
          max={100}
          value={Math.max(camera.zoom, MIN_ZOOM[orientation])}
          onChange={(e) => onCamera({ zoom: Number(e.target.value) })}
        />
        {orientation === 'portrait' && <span className="text-xs">Slide left to zoom out and show more of your camera; the middle fills the screen.</span>}
      </label>
      <Switch checked={camera.mirror} onChange={(v) => onCamera({ mirror: v })} label="Mirror camera" />

      <div className="flex flex-col gap-1.5">
        <Switch
          checked={camera.audio}
          onChange={(v) => onCamera({ audio: v })}
          label="Send camera sound to the live"
          description="Your camera’s microphone or HDMI sound, otherwise your computer’s microphone. Turn off if your live app already adds your mic."
        />
        {camera.audio && live && (
          <p role="status" className={cx('m-0 text-[13px]', audioStatus === 'live' ? 'text-select' : 'text-danger-text')}>
            {audioStatus === 'live' ? `Sound from ${micLabel ?? 'your microphone'}.` : audioStatus !== 'off' && AUDIO_MESSAGES[audioStatus]}
          </p>
        )}
      </div>
    </Panel>
  )
}
