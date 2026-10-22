// The parts of the NegosyoWork Studio API the app uses. Kept in step with
// backend/app/Http/Resources and frontend/src/lib/types.ts.

export type Orientation = 'landscape' | 'portrait'
export type Resolution = '720p' | '1080p'

export type PresetPopupId = 'off10' | 'live' | 'free' | 'b1t1' | 'ship' | 'flash' | 'last' | 'sold' | 'new'
export type PopupKind = 'preset' | 'text' | 'image'
export type TextColor = 'yellow' | 'coral' | 'blue' | 'white'
export type Position = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br'
export type Entrance = 'pop' | 'slide' | 'bounce' | 'none'
export type EffectId = 'none' | 'fireworks' | 'confetti' | 'flags' | 'applause' | 'sparkle' | 'hearts'
export type EffectRepeat = 'once' | 'loop'
export type AutoHide = 0 | 3 | 5 | 10
export type BuiltinSoundId =
  | 'laugh'
  | 'applause'
  | 'bang'
  | 'gun'
  | 'drumroll'
  | 'airhorn'
  | 'kaching'
  | 'ding'
  | 'boo'
  | 'wow'
  | 'crickets'
  | 'rimshot'
  | 'fireworks'
/** A built-in sound, or "media:<id>" for a seller's own upload. */
export type SoundRef = BuiltinSoundId | `media:${number}`
export type Platform = 'facebook' | 'youtube' | 'tiktok' | 'custom'

export interface User {
  id: number
  name: string
  email: string
  role: 'seller' | 'superadmin'
  is_subuser: boolean
  account_name: string
}

export interface Plan {
  id: number
  code: string
  name: string
  price_monthly: number
  currency: string
  max_subusers: number
  max_live_setups: number
  purchasable: boolean
}

export interface SubscriptionSummary {
  plan: Plan
  ends_at: string | null
  trial_ends_at: string | null
  usage: { subusers: number; live_setups: number }
}

export interface PopupLook {
  key: string
  kind: PopupKind
  preset_key: PresetPopupId | null
  label: string | null
  text: string | null
  color: TextColor | null
  media_id: number | null
  media_url?: string | null
  position: Position
  x: number | null
  y: number | null
  size: number
  entrance: Entrance
  effect: EffectId
  effect_repeat: EffectRepeat
}

export interface PopupConfig extends PopupLook {
  auto_hide: AutoHide
  sound: SoundRef | null
}

export interface ScenePopup extends PopupLook {
  shown_at: number
}

/** Settings the app passes through unchanged when it saves (it doesn't edit them). */
export type Opaque = Record<string, unknown>

/** Colour filters (frontend/src/stage/filters.ts; the API's Catalog::CAMERA_FILTERS). */
export type CameraFilterId =
  | 'none'
  | 'fair'
  | 'soft'
  | 'glow'
  | 'clear'
  | 'warm'
  | 'cool'
  | 'vivid'
  | 'pastel'
  | 'dreamy'
  | 'neon'
  | 'vintage'
  | 'film'
  | 'retro'
  | 'cinematic'
  | 'bw'
  | 'noir'

export type BackgroundMode = 'none' | 'blur' | 'image' | 'green'
export type BackgroundPresetId = 'loft' | 'rack' | 'kitchen' | 'vanity' | 'brand' | 'white'
export type KeyColor = 'green' | 'blue'
export type ForegroundDock = 'top' | 'bottom'
export type MediaKind = 'image' | 'background' | 'foreground' | 'sound'

/**
 * The camera part of a setup. Fields the website added over time are optional here, as in
 * the API, so setups saved before they existed still load (the defaults then apply).
 */
export interface CameraSettings {
  source: 'camera' | 'phone'
  device_label: string | null
  mirror: boolean
  /** 0–100; 50 = unchanged. */
  brightness: number
  contrast?: number
  saturation?: number
  warmth?: number
  /** Face enhance, 0 = off. */
  smoothing?: number
  /** A face-tracked effect (set on the website; not drawn on the phone yet). */
  effect?: string
  filter?: CameraFilterId
  filter_strength?: number
  /** −100–100; the phone uses 0–100 (its camera already fits the shape). */
  zoom: number
  audio?: boolean
}

export interface BackgroundSettings {
  mode: BackgroundMode
  preset: BackgroundPresetId
  media_id: number | null
  key_color: KeyColor
  similarity: number
  smoothness: number
}

export interface ForegroundSettings {
  enabled: boolean
  media_id: number | null
  dock: ForegroundDock
}

export interface MediaItem {
  id: number
  kind: MediaKind
  label: string
  url: string
  mime: string
  size: number
  width: number | null
  height: number | null
}

export interface Scene {
  orientation: Orientation
  see_through: boolean
  camera: CameraSettings
  background: BackgroundSettings & { media_url?: string | null }
  foreground: Partial<ForegroundSettings> & { media_url?: string | null }
  popups: ScenePopup[]
}

export interface SoundSettings {
  volume: number
  to_stream: boolean
  monitor: boolean
}

export interface SetupSummary {
  id: number
  name: string
  description: string | null
  is_template: boolean
  orientation: Orientation
  resolution: Resolution
  background_label: string
  linked_sounds: number
  scene: Scene
  updated_at: string | null
}

export interface SetupFull extends SetupSummary {
  camera: CameraSettings
  background: BackgroundSettings
  foreground: ForegroundSettings
  sound_settings: SoundSettings
  output_settings: Opaque
  popups: PopupConfig[]
}

/** What saving a setup sends (PUT /api/setups/{id}). */
export interface SetupDocument {
  name: string
  orientation: Orientation
  resolution: Resolution
  camera: CameraSettings
  background: BackgroundSettings
  foreground: ForegroundSettings
  sound_settings: SoundSettings
  output_settings: Opaque
  popups: PopupConfig[]
}

export interface MobileSession {
  token: string
  expires_at: string | null
  user: User
}

export interface LiveSessionTicket {
  id: string
  heartbeat_seconds: number
}

export interface AppVersion {
  version_code: number
  version_name: string
  min_version_code: number
  apk_url: string | null
  size_mb: number | null
  notes: string[]
}
