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
export type BackgroundMode = 'none' | 'blur' | 'image' | 'green'
export type BackgroundPresetId = 'loft' | 'rack' | 'kitchen' | 'vanity' | 'brand' | 'white'
export type KeyColor = 'green' | 'blue'
export type ForegroundDock = 'top' | 'bottom'
/** "foreground" uploads are kept apart from popup "image" uploads. */
export type MediaKind = 'image' | 'background' | 'foreground' | 'sound'

export interface BackgroundSettings {
  mode: BackgroundMode
  preset: BackgroundPresetId
  /** One of the seller's "background" uploads, shown instead of the preset. */
  media_id: number | null
  key_color: KeyColor
  similarity: number
  smoothness: number
}

/** A full-width image (banner, lower third) docked to the top or bottom of the stage. */
export interface ForegroundSettings {
  enabled: boolean
  media_id: number | null
  dock: ForegroundDock
}

/** One of the seller's uploads (GET /api/media). `url` may be relative: see absoluteUrl(). */
export interface MediaItem {
  id: number
  kind: MediaKind
  label: string
  url: string
  mime: string
  size: number
  width: number | null
  height: number | null
  created_at: string | null
}

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

/** Settings the app passes through unchanged when it saves (it doesn't edit them yet). */
export type Opaque = Record<string, unknown>

export interface Scene {
  orientation: Orientation
  see_through: boolean
  camera: Opaque
  background: Opaque
  foreground: Opaque
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
  camera: Opaque
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
  camera: Opaque
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
