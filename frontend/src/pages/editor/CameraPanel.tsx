import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { Button, Panel, Segmented, Switch, cx } from '../../components/ui'
import type { CameraSettings, Orientation, Resolution } from '../../lib/types'
import { LOOK_PRESETS, isNeutralLook, sameLook, type CameraLook } from '../../stage/enhance'
import { FACE_EFFECTS, faceEffectGroup, type FaceEffectGroup } from '../../stage/faceEffects'
import { CAMERA_FILTERS, DEFAULT_FILTER_STRENGTH } from '../../stage/filters'
import { MIN_ZOOM } from '../../stage/geometry'
import { AUDIO_MESSAGES, CAMERA_MESSAGES, type AudioStatus, type CameraDevice, type CameraStatus } from '../../stage/useCamera'

/** The Camera step's own tabs, so each part fits on screen without scrolling. */
export type CameraSection = 'camera' | 'frame' | 'look' | 'filters' | 'effects' | 'sound'

const SECTIONS: { id: CameraSection; label: string; hint: string }[] = [
  { id: 'camera', label: 'Camera', hint: 'Pick your camera and turn it on.' },
  { id: 'frame', label: 'Frame', hint: 'Shape, quality and how close the camera is.' },
  { id: 'look', label: 'Look', hint: 'Make your picture brighter, warmer or smoother.' },
  { id: 'filters', label: 'Filters', hint: 'A colour style for your whole picture, like Vintage or B&W.' },
  { id: 'effects', label: 'Effects', hint: 'Fun stickers that follow your face.' },
  { id: 'sound', label: 'Sound', hint: 'Choose whether your camera’s sound goes live.' },
]

export function CameraPanel({
  camera,
  orientation,
  resolution,
  section,
  onSection,
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
  section: CameraSection
  onSection: (section: CameraSection) => void
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
  const look: CameraLook = { brightness: camera.brightness, contrast: camera.contrast, saturation: camera.saturation, warmth: camera.warmth, smoothing: camera.smoothing }
  // A dot on a tab that has something switched on, so it's easy to find again.
  const active: Partial<Record<CameraSection, boolean>> = { look: !isNeutralLook(look), filters: camera.filter !== 'none', effects: camera.effect !== 'none' }
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]

  return (
    <Panel title="Camera" headingId="cam-h">
      <div className="flex flex-col gap-1.5">
        <Segmented
          label="Camera settings"
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

      {current.id === 'camera' && (
        <CameraSource
          camera={camera}
          phone={phone}
          live={live}
          status={status}
          devices={devices}
          deviceId={deviceId}
          onCamera={onCamera}
          onSelectDevice={onSelectDevice}
          onStart={onStart}
          onStop={onStop}
        />
      )}

      {current.id === 'frame' && (
        <>
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
        </>
      )}

      {current.id === 'look' && <CameraLookControls look={look} onCamera={onCamera} />}

      {current.id === 'filters' && <FilterPicker camera={camera} onCamera={onCamera} />}

      {current.id === 'effects' && <FaceEffectPicker value={camera.effect} onChange={(effect) => onCamera({ effect })} />}

      {current.id === 'sound' && (
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
          {camera.audio && !live && <p className="m-0 text-[13px] text-muted">Turn the camera on (Camera tab) to check which microphone is used.</p>}
        </div>
      )}
    </Panel>
  )
}

/** Which camera to use, and turning it on and off. */
function CameraSource({
  camera,
  phone,
  live,
  status,
  devices,
  deviceId,
  onCamera,
  onSelectDevice,
  onStart,
  onStop,
}: {
  camera: CameraSettings
  phone: boolean
  live: boolean
  status: CameraStatus
  devices: CameraDevice[]
  deviceId: string | null
  onCamera: (patch: Partial<CameraSettings>) => void
  onSelectDevice: (id: string) => void
  onStart: () => void
  onStop: () => void
}) {
  return (
    <>
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
    </>
  )
}

const LOOK_SLIDERS: { key: keyof CameraLook; label: string; low: string; high: string; hint?: string }[] = [
  { key: 'brightness', label: 'Brightness', low: 'Darker', high: 'Brighter' },
  { key: 'contrast', label: 'Contrast', low: 'Softer', high: 'Punchier' },
  { key: 'saturation', label: 'Color', low: 'Muted', high: 'Vivid' },
  { key: 'warmth', label: 'Warmth', low: 'Cooler', high: 'Warmer' },
  { key: 'smoothing', label: 'Face enhance', low: 'Off', high: 'Strong', hint: 'Evens out skin and adds a soft glow. Eyes, hair and your products stay sharp.' },
]

/** A 0–100 slider shown around its neutral middle: 50 → "0", 62 → "+12", 40 → "-10". */
const signedFromMiddle = (value: number) => (value > 50 ? `+${value - 50}` : String(value - 50))

/** Quick looks and fine-tuning sliders for the camera picture (what viewers see). */
function CameraLookControls({ look, onCamera }: { look: CameraLook; onCamera: (patch: Partial<CameraSettings>) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted">Quick looks</span>
        <div role="group" aria-label="Quick looks" className="flex flex-wrap gap-1.5">
          {LOOK_PRESETS.map((p) => {
            const on = sameLook(look, p.look)
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                onClick={() => onCamera(p.look)}
                className={cx(
                  'min-h-9 rounded-full border-0 px-3.5 text-[13px] font-semibold transition-colors duration-150 motion-reduce:transition-none',
                  on ? 'bg-primary text-white' : 'bg-tint text-link hover:bg-tint-hover',
                )}
              >
                {p.label}
              </button>
            )
          })}
        </div>
      </div>
      {LOOK_SLIDERS.map((s) => (
        <label key={s.key} className="flex flex-col gap-1 text-[13px] text-muted">
          <span className="flex items-baseline justify-between gap-2">
            <span>{s.label}</span>
            <span className="text-xs tabular-nums">{s.key === 'smoothing' ? look.smoothing : signedFromMiddle(look[s.key])}</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={look[s.key]}
            aria-valuetext={`${s.label} ${look[s.key]} of 100`}
            onChange={(e) => onCamera({ [s.key]: Number(e.target.value) })}
          />
          <span className="flex justify-between text-[11px]" aria-hidden="true">
            <span>{s.low}</span>
            <span>{s.high}</span>
          </span>
          {s.hint && <span className="text-xs">{s.hint}</span>}
        </label>
      ))}
    </div>
  )
}

/** Colour filters for the whole picture, with how strongly they apply. */
function FilterPicker({ camera, onCamera }: { camera: CameraSettings; onCamera: (patch: Partial<CameraSettings>) => void }) {
  const strength = camera.filter_strength ?? DEFAULT_FILTER_STRENGTH
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Colour filters" className="grid grid-cols-[repeat(auto-fill,minmax(68px,1fr))] gap-1.5">
        {CAMERA_FILTERS.map((f) => {
          const on = f.id === camera.filter
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={on}
              onClick={() => onCamera({ filter: f.id })}
              className={cx(
                'flex flex-col items-center gap-1 rounded-xl border-2 p-1.5 text-[11px] leading-tight font-semibold transition-[transform,border-color] duration-150 active:scale-95 motion-reduce:transition-none',
                on ? 'border-select bg-tint text-text' : 'border-transparent bg-field text-text-2 hover:text-text',
              )}
            >
              <span aria-hidden="true" className="block h-10 w-full rounded-lg" style={{ background: f.swatch }} />
              {f.label}
            </button>
          )
        })}
      </div>
      {camera.filter !== 'none' && (
        <div className="flex flex-col gap-1 text-[13px] text-muted">
          <span className="flex items-baseline justify-between gap-2">
            <span aria-hidden="true">Strength</span>
            <span className="text-xs tabular-nums">{strength}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={strength}
            aria-label="Filter strength"
            aria-valuetext={`${strength}%`}
            onChange={(e) => onCamera({ filter_strength: Number(e.target.value) })}
          />
        </div>
      )}
    </div>
  )
}

/** Face-tracked effects (makeup looks, flower crown, puppy ears…), shown on the preview and the live. */
function FaceEffectPicker({ value, onChange }: { value: CameraSettings['effect']; onChange: (effect: CameraSettings['effect']) => void }) {
  // Two short lists instead of one long one; opens on the list holding the current effect.
  const [group, setGroup] = useState<FaceEffectGroup>(() => faceEffectGroup(value))
  return (
    <div className="flex flex-col gap-1.5">
      <Segmented
        label="Effect type"
        size="sm"
        value={group}
        onChange={setGroup}
        options={[
          { id: 'makeup', label: '💄 Makeup' },
          { id: 'fun', label: '🎉 Fun' },
        ]}
      />
      <div role="group" aria-label={group === 'makeup' ? 'Makeup looks' : 'Fun effects'} className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-1.5">
        {FACE_EFFECTS.filter((e) => e.group === group || e.group === 'both').map((e) => {
          const on = e.id === value
          return (
            <button
              key={e.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(e.id)}
              className={cx(
                'flex min-h-[68px] flex-col items-center justify-center gap-1 rounded-xl border-2 px-1 py-1.5 text-[11px] leading-tight font-semibold transition-[transform,border-color,background-color] duration-150 active:scale-95 motion-reduce:transition-none',
                on ? 'border-select bg-tint text-text' : 'border-transparent bg-field text-text-2 hover:text-text',
              )}
            >
              <span aria-hidden="true" className="text-[22px] leading-none">
                {e.icon}
              </span>
              {e.label}
            </button>
          )
        })}
      </div>
      <span className="text-xs text-muted">Follows your face on the preview and the live. Face the camera in good light for the best tracking.</span>
    </div>
  )
}
