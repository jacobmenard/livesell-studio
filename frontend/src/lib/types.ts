// Shapes of the NegosyoWork Studio API (Laravel). Keep in sync with app/Http/Resources.

export type Orientation = 'landscape' | 'portrait'
export type Resolution = '720p' | '1080p'
export type ThemePref = 'light' | 'dark' | 'system'

/** Colour filters for the camera picture (src/stage/filters.ts; same list as the API's Catalog). */
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

/** Face-tracked camera effects (drawn by src/stage/faceEffects.ts; same list as the API's Catalog). */
export type FaceEffectId =
  | 'none'
  | 'glam'
  | 'natural-makeup'
  | 'fresh-face'
  | 'clean-girl'
  | 'latte'
  | 'strawberry'
  | 'cold-girl'
  | 'sun-kissed'
  | 'douyin'
  | 'glazed-donut'
  | 'mob-wife'
  | 'siren-eyes'
  | 'tomato-girl'
  | 'igari'
  | 'coquette'
  | 'cherry-cola'
  | 'brownie-glazed'
  | 'supermodel-90s'
  | 'blueberry-milk'
  | 'barbie'
  | 'soft-goth'
  | 'euphoria'
  | 'grunge'
  | 'vampire'
  | 'pearl'
  | 'nude-glow'
  | 'rosy-cheeks'
  | 'peach-fresh'
  | 'coral-summer'
  | 'soft-berry'
  | 'mlbb'
  | 'k-beauty'
  | 'bronzed'
  | 'evening-glam'
  | 'pink-doll'
  | 'glow-eyes'
  | 'flower-crown'
  | 'butterflies'
  | 'puppy'
  | 'bunny'
  | 'kitty'
  | 'bear'
  | 'heart-eyes'
  | 'star-eyes'
  | 'money-eyes'
  | 'shades'
  | 'crown'
  | 'halo'
  | 'devil'
  | 'blush'
  | 'sparkles'
  | 'love-hearts'
  | 'crying'
  | 'clown'
  | 'mustache'
  | 'piggy'
  | 'cowboy'
  | 'party'
  | 'rainbow'
  | 'tiara'
  | 'bow'
  | 'deer'
  | 'fox'
  | 'frog-hat'
  | 'heart-glasses'
  | 'dizzy-stars'
  | 'petals'
  | 'witch-hat'
  | 'shopping'

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
/** A built-in sound id, or "media:<id>" for a seller's own upload. */
export type SoundRef = BuiltinSoundId | `media:${number}`

export type BackgroundMode = 'none' | 'blur' | 'image' | 'green'
export type BackgroundPresetId = 'loft' | 'rack' | 'kitchen' | 'vanity' | 'brand' | 'white'
export type KeyColor = 'green' | 'blue'
export type OutputMethod = 'window' | 'rtmp' | 'vcam'
export type Platform = 'facebook' | 'youtube' | 'tiktok' | 'custom'
/** "foreground" uploads are kept apart from popup "image" uploads. */
export type MediaKind = 'image' | 'background' | 'foreground' | 'sound'

export interface User {
  id: number
  name: string
  email: string
  theme: ThemePref
  role: 'seller' | 'superadmin'
  /** A team member working in someone else's account (setups, uploads, plan). */
  is_subuser: boolean
  /** The account owner's name (the user's own for owners). */
  account_name: string
  /** Walkthroughs already finished or skipped (they start once, on first visit). */
  completed_tours: TourName[]
  /** The superadmin's name while they're signed in as this owner (impersonation), else null. */
  impersonated_by: string | null
}

/** A seller account owner, on the superadmin's Admin page. */
export interface AdminAccount {
  id: number
  name: string
  email: string
  plan: Plan
  ends_at: string | null
  /** Set while the account is in its free week. */
  trial_ends_at: string | null
  members: number
  joined_at: string | null
  /** Set while the superadmin has deactivated the account (nobody in it can sign in). */
  disabled_at: string | null
}

/** One account on the superadmin's Users page (View). */
export interface AdminAccountDetail extends AdminAccount {
  setups: number
  /** Platforms with a saved stream key (never the keys). */
  platforms: Platform[]
  team: TeamMember[]
  /** The latest few, newest first. */
  payments: Payment[]
}

export type TourName = 'dashboard' | 'editor'

export interface Plan {
  id: number
  code: string
  name: string
  /** Whole units of `currency` per month. */
  price_monthly: number
  currency: string
  max_subusers: number
  max_live_setups: number
  /** False for the free trial (what unpaid accounts have). */
  purchasable: boolean
}

export interface SubscriptionSummary {
  plan: Plan
  ends_at: string | null
  /** Set during the free week after signing up: `plan` is then the trial's, not a paid one. */
  trial_ends_at: string | null
  usage: { subusers: number; live_setups: number }
  plans: Plan[]
  /** The ways to pay the superadmin has turned on; empty means plans can't be paid for yet. */
  payment_methods: PaymentMethod[]
  /** A payment the superadmin hasn't checked yet (one at a time). */
  pending_payment: Payment | null
  /** The next month of the current paid plan, which can be paid ahead. */
  next_payment: NextPayment | null
  /** The latest payments, for the account owner (empty for sub-users). */
  payments: Payment[]
}

export interface NextPayment {
  plan: Plan
  amount: number
  currency: string
  /** When the paid month ends. */
  due_at: string
  /** Renewing opens one month before it's due; null = it can be paid now. */
  renewable_from: string | null
}

export type PaymentStatus = 'pending' | 'approved' | 'rejected'

export interface Payment {
  id: number
  plan: Plan
  amount: number
  currency: string
  method: string
  /** Where the money went (method, number, name), copied when it was sent. */
  method_label: string | null
  reference_number: string
  status: PaymentStatus
  /** Why it was rejected. */
  review_note: string | null
  submitted_at: string | null
  reviewed_at: string | null
  /** The month it bought, once approved. */
  period_start: string | null
  period_end: string | null
}

/** A payment on the superadmin's review list. */
export type PaymentMethodType = 'gcash' | 'maya' | 'bank'

/** A GCash, Maya or bank account sellers can pay into. */
export interface PaymentMethod {
  id: number
  type: PaymentMethodType
  /** The bank's name for a bank; optional for GCash / Maya. */
  label: string | null
  /** What sellers see: the label, or "GCash" / "Maya". */
  name: string
  account_name: string
  account_number: string
  instructions: string | null
  enabled: boolean
  sort_order: number
}

export interface PaymentMethodInput {
  type: PaymentMethodType
  label: string
  account_name: string
  account_number: string
  instructions: string
  enabled: boolean
}

export interface AdminPayment extends Payment {
  account: { id: number; name: string; email: string }
  submitted_by: string | null
  reviewed_by: string | null
}

export interface TeamMember {
  id: number
  name: string
  email: string
  /** False while paused because the plan has fewer seats than members. */
  active: boolean
  added_at: string | null
}

export interface TeamState {
  seats: number
  plan_name: string
  members: TeamMember[]
}

export interface CameraSettings {
  source: 'camera' | 'phone'
  device_label: string | null
  mirror: boolean
  /** The camera's look (0–100; 50 = unchanged, smoothing 0 = off). */
  brightness: number
  contrast: number
  saturation: number
  warmth: number
  /** Face enhance: evens out skin and adds a soft glow. */
  smoothing: number
  /** A face-tracked effect (flower crown, puppy ears…), or "none". */
  effect: FaceEffectId
  /** A colour filter for the whole picture, and how strongly it applies (0–100). */
  filter: CameraFilterId
  filter_strength: number
  zoom: number
  /** Send the camera's own sound (or the default microphone) with the clean screen. */
  audio: boolean
}

export interface BackgroundSettings {
  mode: BackgroundMode
  preset: BackgroundPresetId
  media_id: number | null
  key_color: KeyColor
  similarity: number
  smoothness: number
}

export type ForegroundDock = 'top' | 'bottom'

/** A full-width image (banner, lower third) docked to the top or bottom of the stage. */
export interface ForegroundSettings {
  enabled: boolean
  /** One of the seller's image uploads. */
  media_id: number | null
  dock: ForegroundDock
}

export interface SoundSettings {
  volume: number
  to_stream: boolean
  monitor: boolean
}

export interface OutputSettings {
  method: OutputMethod
  see_through: boolean
  safe_zones: boolean
}

/** The look of a popup (shared by the saved popup and the on-screen copy). */
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
  /** Where it was dragged on the preview: its centre as a % of the stage. Null = use `position`. */
  x: number | null
  y: number | null
  /** Percentage of the original "Medium" size (see POPUP_SIZE). */
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
  /** Changes every time the popup is shown, so its entrance plays again. */
  shown_at: number
}

export interface Scene {
  orientation: Orientation
  see_through: boolean
  camera: CameraSettings
  background: BackgroundSettings & { media_url?: string | null }
  foreground: ForegroundSettings & { media_url?: string | null }
  popups: ScenePopup[]
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
  output_settings: OutputSettings
  popups: PopupConfig[]
}

/** What "Save setup" sends. */
export interface SetupDocument {
  name: string
  orientation: Orientation
  resolution: Resolution
  camera: CameraSettings
  background: BackgroundSettings
  foreground: ForegroundSettings
  sound_settings: SoundSettings
  output_settings: OutputSettings
  popups: PopupConfig[]
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

export interface OutputLinkState {
  active: boolean
  /** Only present right after the link is made. */
  token?: string
  url?: string
  created_at: string | null
  last_seen_at: string | null
}

export interface Destination {
  platform: Platform
  server_url: string
  key_hint: string
  updated_at: string | null
}

export interface SoundEvent {
  sound: SoundRef
  url: string | null
  volume: number
}
