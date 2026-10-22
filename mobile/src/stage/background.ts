import type {
  BackgroundMode,
  BackgroundPresetId,
  BackgroundSettings,
  ForegroundDock,
  ForegroundSettings,
  KeyColor,
  MediaItem,
} from '@/api/types'
import { absoluteUrl } from '@/config'

// Kept in step with frontend/src/stage/catalog.ts and backend SetupDefaults.

type ModeInfo = { id: BackgroundMode; label: string; help: string }
type PresetInfo = { id: BackgroundPresetId; label: string; tone: string }

const PICTURE_MODE: ModeInfo = { id: 'image', label: 'Picture', help: 'Swaps your room for a picture. No green cloth needed.' }
const RACK: PresetInfo = { id: 'rack', label: 'Boutique rack', tone: '#24324A' }

export const BACKGROUND_MODES: ModeInfo[] = [
  { id: 'none', label: 'None', help: 'Viewers see your real room behind you.' },
  { id: 'blur', label: 'Blur', help: 'Softly blurs your room so the focus stays on you.' },
  PICTURE_MODE,
  { id: 'green', label: 'Green screen', help: 'Cleanest edges. Hang a green or blue cloth behind you, then pick the picture to show.' },
]

export const BACKGROUND_PRESETS: PresetInfo[] = [
  { id: 'loft', label: 'Studio loft', tone: '#3A3424' },
  RACK,
  { id: 'kitchen', label: 'Kitchen set', tone: '#4A2E24' },
  { id: 'vanity', label: 'Vanity corner', tone: '#402433' },
  { id: 'brand', label: 'Brand wall', tone: '#2B2148' },
  { id: 'white', label: 'Clean white', tone: '#E9E4DA' },
]

export const KEY_COLORS: { id: KeyColor; label: string; swatch: string }[] = [
  { id: 'green', label: 'Green', swatch: '#1E9E57' },
  { id: 'blue', label: 'Blue', swatch: '#2F6BFF' },
]

/** The web edits these with sliders (0–100); the phone offers three steps around the default. */
export const SIMILARITY_LEVELS = [
  { id: '30', label: 'Low' },
  { id: '42', label: 'Medium' },
  { id: '60', label: 'High' },
] as const

export const SMOOTHNESS_LEVELS = [
  { id: '8', label: 'Sharp' },
  { id: '18', label: 'Medium' },
  { id: '32', label: 'Soft' },
] as const

export const DOCKS: { id: ForegroundDock; label: string }[] = [
  { id: 'top', label: 'Top' },
  { id: 'bottom', label: 'Bottom' },
]

export function modeInfo(mode: BackgroundMode): ModeInfo {
  return BACKGROUND_MODES.find((m) => m.id === mode) ?? PICTURE_MODE
}

export function presetInfo(preset: BackgroundPresetId): PresetInfo {
  return BACKGROUND_PRESETS.find((p) => p.id === preset) ?? RACK
}

const MODES = new Set<string>(BACKGROUND_MODES.map((m) => m.id))
const PRESETS = new Set<string>(BACKGROUND_PRESETS.map((p) => p.id))

const DEFAULT_BACKGROUND: BackgroundSettings = { mode: 'image', preset: 'rack', media_id: null, key_color: 'green', similarity: 42, smoothness: 18 }

const level = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : fallback

/** A setup's background with every field set (setups saved before a field existed miss it). */
export function backgroundOf(raw: unknown): BackgroundSettings {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    mode: typeof b.mode === 'string' && MODES.has(b.mode) ? (b.mode as BackgroundMode) : DEFAULT_BACKGROUND.mode,
    preset: typeof b.preset === 'string' && PRESETS.has(b.preset) ? (b.preset as BackgroundPresetId) : DEFAULT_BACKGROUND.preset,
    media_id: typeof b.media_id === 'number' ? b.media_id : null,
    key_color: b.key_color === 'blue' ? 'blue' : 'green',
    similarity: level(b.similarity, DEFAULT_BACKGROUND.similarity),
    smoothness: level(b.smoothness, DEFAULT_BACKGROUND.smoothness),
  }
}

/** A setup's foreground; setups saved before foregrounds existed have it off. */
export function foregroundOf(raw: unknown): ForegroundSettings {
  const f = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const mediaId = typeof f.media_id === 'number' ? f.media_id : null
  return {
    enabled: f.enabled === true && mediaId !== null,
    media_id: mediaId,
    dock: f.dock === 'top' ? 'top' : 'bottom',
  }
}

/** The step closest to a stored value (a value set with the web's slider shows its nearest step). */
export function nearestLevel<T extends { id: string }>(levels: readonly T[], value: number): T['id'] {
  return levels.reduce((best, l) => (Math.abs(Number(l.id) - value) < Math.abs(Number(best.id) - value) ? l : best)).id
}

/** Shows a picture (Picture and Green screen modes). */
export function showsPicture(background: BackgroundSettings): boolean {
  return background.mode === 'image' || background.mode === 'green'
}

/** The upload a setting points at, if it's still in the account's library (and of the right kind). */
export function pickedMedia(media: MediaItem[] | undefined, id: number | null, kind: 'background' | 'foreground'): MediaItem | null {
  if (id === null || !media) return null
  return media.find((m) => m.id === id && m.kind === kind) ?? null
}

/** What the editor preview shows behind the popups: a picture, or a built-in backdrop's colour. */
export function previewBackground(background: BackgroundSettings, media: MediaItem[] | undefined): { imageUrl: string | null; tone: string } {
  const preset = presetInfo(background.preset)
  if (!showsPicture(background)) return { imageUrl: null, tone: RACK.tone }
  const own = pickedMedia(media, background.media_id, 'background')
  return { imageUrl: own ? absoluteUrl(own.url) : null, tone: own ? '#17151C' : preset.tone }
}

/** The foreground picture to show, when it's on and its upload still exists. */
export function foregroundImage(foreground: ForegroundSettings, media: MediaItem[] | undefined): MediaItem | null {
  if (!foreground.enabled) return null
  return pickedMedia(media, foreground.media_id, 'foreground')
}

/** The native streamer's instruction for the foreground: full width, docked, under the popups. */
export interface ForegroundDrawSpec {
  kind: 'foreground'
  imageUrl: string
  dock: ForegroundDock
}

export function foregroundSpec(foreground: ForegroundSettings, media: MediaItem[] | undefined): ForegroundDrawSpec | null {
  const item = foregroundImage(foreground, media)
  const imageUrl = item ? absoluteUrl(item.url) : null
  return imageUrl ? { kind: 'foreground', imageUrl, dock: foreground.dock } : null
}
