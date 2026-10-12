import type {
  AutoHide,
  BackgroundMode,
  BackgroundPresetId,
  BuiltinSoundId,
  EffectId,
  EffectRepeat,
  Entrance,
  KeyColor,
  Platform,
  Position,
  PresetPopupId,
  TextColor,
} from '../lib/types'

// The fixed vocabulary of the stage. The API (app/Support/Catalog.php) accepts exactly
// these keys; the look of each one lives here.

export type PopupShape = 'tag' | 'pill' | 'circle'

export interface PresetPopup {
  id: PresetPopupId
  text: string
  bg: string
  fg: string
  shape: PopupShape
  rot: string
  border?: string
  position: Position
  effect: EffectId
  effectRepeat: EffectRepeat
}

export const PRESET_POPUPS: PresetPopup[] = [
  { id: 'off10', text: '10% OFF', bg: '#F5C542', fg: '#0D0C10', shape: 'tag', rot: '-6deg', position: 'tr', effect: 'fireworks', effectRepeat: 'loop' },
  { id: 'live', text: 'LIVE TODAY', bg: '#FF5A36', fg: '#0D0C10', shape: 'pill', rot: '0deg', position: 'tl', effect: 'sparkle', effectRepeat: 'loop' },
  { id: 'free', text: 'FREE', bg: '#8AB4FF', fg: '#0D0C10', shape: 'circle', rot: '8deg', position: 'br', effect: 'confetti', effectRepeat: 'once' },
  { id: 'b1t1', text: 'BUY 1 TAKE 1', bg: '#C6F36B', fg: '#0D0C10', shape: 'tag', rot: '-3deg', position: 'bl', effect: 'applause', effectRepeat: 'once' },
  { id: 'ship', text: 'FREE SHIPPING', bg: '#F4F1EA', fg: '#0D0C10', shape: 'pill', rot: '0deg', position: 'tc', effect: 'none', effectRepeat: 'once' },
  { id: 'flash', text: 'FLASH SALE', bg: '#0D0C10', fg: '#F5C542', border: '0.12em solid #F5C542', shape: 'tag', rot: '-4deg', position: 'mc', effect: 'flags', effectRepeat: 'once' },
  { id: 'last', text: 'LAST 5 PCS', bg: '#F5C542', fg: '#0D0C10', shape: 'pill', rot: '3deg', position: 'mr', effect: 'none', effectRepeat: 'once' },
  { id: 'sold', text: 'SOLD OUT', bg: '#C2341F', fg: '#FFFFFF', shape: 'tag', rot: '-8deg', position: 'mc', effect: 'none', effectRepeat: 'once' },
  { id: 'new', text: 'NEW', bg: '#F2A3B8', fg: '#0D0C10', shape: 'circle', rot: '-8deg', position: 'ml', effect: 'hearts', effectRepeat: 'once' },
]

export const PRESET_BY_ID = Object.fromEntries(PRESET_POPUPS.map((p) => [p.id, p])) as Record<PresetPopupId, PresetPopup>

export const TEXT_COLORS: { id: TextColor; name: string; bg: string; fg: string }[] = [
  { id: 'yellow', name: 'Yellow', bg: '#F5C542', fg: '#0D0C10' },
  { id: 'coral', name: 'Coral', bg: '#FF5A36', fg: '#0D0C10' },
  { id: 'blue', name: 'Blue', bg: '#8AB4FF', fg: '#0D0C10' },
  { id: 'white', name: 'White', bg: '#F4F1EA', fg: '#0D0C10' },
]

export const EFFECTS: { id: EffectId; label: string; sound?: BuiltinSoundId }[] = [
  { id: 'none', label: 'None' },
  { id: 'fireworks', label: 'Fireworks', sound: 'fireworks' },
  { id: 'confetti', label: 'Confetti' },
  { id: 'flags', label: 'Banderitas' },
  { id: 'applause', label: 'Applause', sound: 'applause' },
  { id: 'sparkle', label: 'Sparkles' },
  { id: 'hearts', label: 'Hearts' },
]

export const effectLabel = (id: EffectId) => EFFECTS.find((e) => e.id === id)?.label ?? 'None'

export const SOUNDS: { id: BuiltinSoundId; label: string; key: string; color: string }[] = [
  { id: 'laugh', label: 'Laugh', key: '1', color: '#F5C542' },
  { id: 'applause', label: 'Applause', key: '2', color: '#C6F36B' },
  { id: 'bang', label: 'Bang', key: '3', color: '#FF5A36' },
  { id: 'gun', label: 'Gunshot', key: '4', color: '#FF5A36' },
  { id: 'drumroll', label: 'Drumroll', key: '5', color: '#8AB4FF' },
  { id: 'airhorn', label: 'Air horn', key: '6', color: '#F2A3B8' },
  { id: 'kaching', label: 'Ka-ching', key: '7', color: '#C6F36B' },
  { id: 'ding', label: 'Ding', key: '8', color: '#8AB4FF' },
  { id: 'boo', label: 'Boo', key: '9', color: '#B9A3FF' },
  { id: 'wow', label: 'Wow', key: '0', color: '#F5C542' },
  { id: 'crickets', label: 'Crickets', key: 'Q', color: '#7FD8C9' },
  { id: 'rimshot', label: 'Ba-dum-tss', key: 'W', color: '#F2A3B8' },
  { id: 'fireworks', label: 'Fireworks', key: 'E', color: '#F5C542' },
]

export const POSITIONS: Position[] = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br']

export const POSITION_NAMES: Record<string, string> = { t: 'Top', m: 'Middle', b: 'Bottom', l: 'left', c: 'center', r: 'right' }

/**
 * Popup size: a percentage of the original "Medium" (same limits as the API). The max is a
 * safety ceiling: resizing on the preview stops once the popup is as wide as the screen.
 */
export const POPUP_SIZE = { min: 40, max: 1500, step: 5, default: 100 } as const

export const ENTRANCES: { id: Entrance; label: string }[] = [
  { id: 'pop', label: 'Pop' },
  { id: 'slide', label: 'Slide' },
  { id: 'bounce', label: 'Bounce' },
  { id: 'none', label: 'None' },
]

export const AUTO_HIDES: { id: AutoHide; label: string }[] = [
  { id: 0, label: 'Never' },
  { id: 3, label: '3 sec' },
  { id: 5, label: '5 sec' },
  { id: 10, label: '10 sec' },
]

export const BACKGROUND_MODES: { id: BackgroundMode; label: string; help: string }[] = [
  { id: 'none', label: 'None', help: 'Viewers see your real room behind you.' },
  { id: 'blur', label: 'Blur', help: 'Softly blurs your room so the focus stays on you.' },
  { id: 'image', label: 'Picture', help: 'Swaps your room for a picture. No green cloth needed.' },
  { id: 'green', label: 'Green screen', help: 'Cleanest edges. Hang a green or blue cloth behind you, then pick the picture to show.' },
]

export const BACKGROUND_PRESETS: { id: BackgroundPresetId; label: string; tone: string; src: string }[] = [
  { id: 'loft', label: 'Studio loft', tone: '#3A3424', src: '/backgrounds/loft.svg' },
  { id: 'rack', label: 'Boutique rack', tone: '#24324A', src: '/backgrounds/rack.svg' },
  { id: 'kitchen', label: 'Kitchen set', tone: '#4A2E24', src: '/backgrounds/kitchen.svg' },
  { id: 'vanity', label: 'Vanity corner', tone: '#402433', src: '/backgrounds/vanity.svg' },
  { id: 'brand', label: 'Brand wall', tone: '#2B2148', src: '/backgrounds/brand.svg' },
  { id: 'white', label: 'Clean white', tone: '#E9E4DA', src: '/backgrounds/white.svg' },
]

export const BACKGROUND_BY_ID = Object.fromEntries(BACKGROUND_PRESETS.map((b) => [b.id, b])) as Record<
  BackgroundPresetId,
  (typeof BACKGROUND_PRESETS)[number]
>

export const KEY_COLORS: { id: KeyColor; label: string; swatch: string; rgb: [number, number, number] }[] = [
  { id: 'green', label: 'Green', swatch: '#1E9E57', rgb: [0.0, 0.69, 0.25] },
  { id: 'blue', label: 'Blue', swatch: '#2F6BFF', rgb: [0.0, 0.28, 0.73] },
]

export const PLATFORMS: { id: Platform; label: string; server: string; note: string }[] = [
  { id: 'facebook', label: 'Facebook', server: 'rtmps://live-api-s.facebook.com:443/rtmp/', note: 'Get your stream key in Facebook Live Producer → Streaming software.' },
  { id: 'youtube', label: 'YouTube', server: 'rtmp://a.rtmp.youtube.com/live2', note: 'Find your stream key in YouTube Studio → Go live → Stream.' },
  {
    id: 'tiktok',
    label: 'TikTok',
    server: '',
    note: 'Only TikTok accounts with stream key access get a server URL and key. No access? Use the clean screen with TikTok LIVE Studio instead.',
  },
  { id: 'custom', label: 'Other', server: '', note: 'Any RTMP or RTMPS server, like Restream or your own.' },
]

/** Where TikTok / Facebook draw their own UI over the video (approximate, preview only). */
export const SAFE_ZONES = {
  portrait: [
    { label: 'Name and viewers', top: '0%', left: '0%', w: '100%', h: '11%' },
    { label: 'Buttons', top: '45%', left: '84%', w: '16%', h: '40%' },
    { label: 'Comments and gifts', top: '66%', left: '0%', w: '84%', h: '34%' },
  ],
  landscape: [
    { label: 'Live badge and viewers', top: '0%', left: '0%', w: '30%', h: '14%' },
    { label: 'Comments on phones', top: '78%', left: '0%', w: '100%', h: '22%' },
  ],
} as const

export const MAX_POPUPS_ON_SCREEN = 12
export const MAX_TEXT_LENGTH = 24
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

/** Popups always use the brand display face, whatever the app theme. */
export const DISPLAY_FONT = "'Bricolage Grotesque', 'Trebuchet MS', sans-serif"
