import type { BackgroundMode, BackgroundSettings, CameraSettings, ForegroundDock, ForegroundSettings, MediaItem } from '@/api/types'
import { BACKGROUND_PRESETS, DEFAULT_BACKGROUND, DEFAULT_CAMERA, DEFAULT_FOREGROUND, isBackgroundPreset, KEY_COLORS } from './backgrounds'
import { DEFAULT_FILTER_STRENGTH, filterGrade, isCameraFilter } from './filters'

/**
 * Everything the native streamer needs to draw the camera picture: the look, the colour
 * filter, the background and the foreground, as shader-ready numbers. Built here (not in
 * Kotlin) so the website's formulas live in one testable place:
 *  - look: frontend/src/stage/enhance.ts Enhancer.render
 *  - green screen: frontend/src/stage/chroma.ts ChromaKeyer.render
 *  - picture fallback and media URLs: frontend/src/stage/scene.ts buildScene
 */
export interface NativeLook {
  mirror: boolean
  /** 1 = the camera fills the stage; up to 2 = zoomed in. */
  zoom: number
  /** Multipliers and offsets exactly as the web shader's uniforms. */
  brightness: number
  contrast: number
  saturation: number
  warmth: number
  smoothing: number
  filter: NativeFilter
  background: NativeBackground
  foreground: NativeForeground | null
}

export interface NativeFilter {
  /** 0 = off. */
  strength: number
  gain: [number, number, number]
  contrast: number
  saturation: number
  fade: number
  shadows: [number, number, number]
  highlights: [number, number, number]
  mono: number
  vignette: number
  grain: number
}

export interface NativeBackground {
  mode: BackgroundMode
  /** A built-in backdrop bundled with the app (used when there's no photo URL). */
  preset: string
  /** The seller's own photo, when one is picked and still exists. */
  imageUrl: string | null
  /** Shown while a picture loads. */
  tone: string
  key: [number, number, number]
  similarity: number
  smoothness: number
}

export interface NativeForeground {
  url: string
  dock: ForegroundDock
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

/** Fills in fields a setup saved before they existed (same defaults as the API). */
export function cameraWithDefaults(camera: Partial<CameraSettings> | undefined): CameraSettings {
  return { ...DEFAULT_CAMERA, ...(camera ?? {}) }
}

export function backgroundWithDefaults(background: Partial<BackgroundSettings> | undefined): BackgroundSettings {
  const b = { ...DEFAULT_BACKGROUND, ...(background ?? {}) }
  return isBackgroundPreset(b.preset) ? b : { ...b, preset: DEFAULT_BACKGROUND.preset }
}

export function foregroundWithDefaults(foreground: Partial<ForegroundSettings> | undefined): ForegroundSettings {
  return { ...DEFAULT_FOREGROUND, ...(foreground ?? {}) }
}

/** The look as the shader takes it. */
export function nativeLook(
  input: { camera: Partial<CameraSettings> | undefined; background: Partial<BackgroundSettings> | undefined; foreground: Partial<ForegroundSettings> | undefined },
  media: Pick<MediaItem, 'id' | 'url'>[],
): NativeLook {
  const camera = cameraWithDefaults(input.camera)
  const background = backgroundWithDefaults(input.background)
  const foreground = foregroundWithDefaults(input.foreground)
  const urls = new Map(media.map((m) => [m.id, m.url]))

  const filterId = isCameraFilter(camera.filter) ? camera.filter : 'none'
  const strength = clamp(num(camera.filter_strength, DEFAULT_FILTER_STRENGTH), 0, 100)
  const g = filterGrade(filterId)
  const filtered = filterId !== 'none' && strength > 0

  const preset = BACKGROUND_PRESETS.find((b) => b.id === background.preset) ?? BACKGROUND_PRESETS[1]!
  // A deleted photo falls back to the built-in picture, like the website.
  const photo = background.media_id ? (urls.get(background.media_id) ?? null) : null
  const key = (KEY_COLORS.find((k) => k.id === background.key_color) ?? KEY_COLORS[0]!).rgb
  const foregroundUrl = foreground.enabled && foreground.media_id ? (urls.get(foreground.media_id) ?? null) : null

  return {
    mirror: camera.mirror,
    // The phone's camera already has the stage's shape, so zooming out (below 0) changes nothing.
    zoom: 1 + clamp(num(camera.zoom, 0), 0, 100) / 100,
    brightness: 0.5 + clamp(num(camera.brightness, 50), 0, 100) / 100,
    contrast: 0.5 + clamp(num(camera.contrast, 50), 0, 100) / 100,
    saturation: clamp(num(camera.saturation, 50), 0, 100) / 50,
    warmth: (clamp(num(camera.warmth, 50), 0, 100) - 50) / 50,
    smoothing: clamp(num(camera.smoothing, 0), 0, 100) / 100,
    filter: {
      strength: filtered ? strength / 100 : 0,
      gain: g.gain ?? [1, 1, 1],
      contrast: g.contrast ?? 1,
      saturation: g.saturation ?? 1,
      fade: g.fade ?? 0,
      shadows: g.shadows ?? [0, 0, 0],
      highlights: g.highlights ?? [0, 0, 0],
      mono: g.mono ?? 0,
      vignette: g.vignette ?? 0,
      grain: g.grain ?? 0,
    },
    background: {
      mode: background.mode,
      preset: preset.id,
      imageUrl: photo,
      tone: photo ? '#17151C' : preset.tone,
      key,
      similarity: 0.02 + (clamp(background.similarity, 0, 100) / 100) * 0.38,
      smoothness: 0.002 + (clamp(background.smoothness, 0, 100) / 100) * 0.2,
    },
    foreground: foregroundUrl ? { url: foregroundUrl, dock: foreground.dock } : null,
  }
}
