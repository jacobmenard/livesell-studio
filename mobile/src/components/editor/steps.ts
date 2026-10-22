import type { MediaItem, SetupDocument } from '@/api/types'
import { BACKGROUND_MODES, BACKGROUND_PRESETS } from '@/stage/backgrounds'
import { CAMERA_FILTERS, LOOK_PRESETS, NEUTRAL_LOOK, sameLook, type CameraLook } from '@/stage/filters'
import { backgroundWithDefaults, cameraWithDefaults, foregroundWithDefaults, mediaUrl } from '@/stage/stageLook'

export type Step = 'camera' | 'background' | 'popups' | 'foreground' | 'sounds'

export const STEPS: { id: Step; label: string }[] = [
  { id: 'camera', label: 'Camera' },
  { id: 'background', label: 'Background' },
  { id: 'popups', label: 'Popups' },
  { id: 'foreground', label: 'Foreground' },
  { id: 'sounds', label: 'Sounds' },
]

/**
 * One line per editor step saying what it's set to ("Picture · Studio loft"), shown under
 * each step in the tablet editor's step list, so a seller sees the whole setup at a glance.
 */
export function stepSummaries(doc: SetupDocument, media: Pick<MediaItem, 'id' | 'url' | 'kind'>[]): Record<Step, string> {
  const camera = cameraWithDefaults(doc.camera)
  const look: CameraLook = {
    brightness: camera.brightness,
    contrast: camera.contrast ?? NEUTRAL_LOOK.contrast,
    saturation: camera.saturation ?? NEUTRAL_LOOK.saturation,
    warmth: camera.warmth ?? NEUTRAL_LOOK.warmth,
    smoothing: camera.smoothing ?? NEUTRAL_LOOK.smoothing,
  }
  const lookName = LOOK_PRESETS.find((p) => sameLook(p.look, look))?.label ?? 'Your own look'
  const filter = camera.filter && camera.filter !== 'none' ? CAMERA_FILTERS.find((f) => f.id === camera.filter)?.label : undefined

  const background = backgroundWithDefaults(doc.background)
  const mode = BACKGROUND_MODES.find((m) => m.id === background.mode)?.label ?? 'None'
  const showsPicture = background.mode === 'image' || background.mode === 'green'
  const ownPhoto = mediaUrl(media, background.media_id, 'background') !== null
  const picture = ownPhoto ? 'Your photo' : (BACKGROUND_PRESETS.find((p) => p.id === background.preset)?.label ?? 'Built-in picture')

  const foreground = foregroundWithDefaults(doc.foreground)
  const count = doc.popups.length
  const volume = doc.sound_settings.volume >= 85 ? 'Loud' : doc.sound_settings.volume >= 55 ? 'Medium' : 'Soft'

  return {
    camera: filter ? `${lookName} · ${filter}` : lookName,
    background: showsPicture ? `${mode} · ${picture}` : mode,
    popups: count === 0 ? 'None yet' : count === 1 ? '1 in this setup' : `${count} in this setup`,
    foreground: foreground.enabled ? `On · ${foreground.dock === 'top' ? 'top' : 'bottom'}` : 'Off',
    sounds: `${volume} · ${doc.sound_settings.to_stream ? 'viewers hear' : 'only you'}`,
  }
}
