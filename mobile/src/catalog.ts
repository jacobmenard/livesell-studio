import type {
  AutoHide,
  BuiltinSoundId,
  EffectId,
  EffectRepeat,
  Platform,
  Position,
  PresetPopupId,
  TextColor,
} from '@/api/types'

// The fixed vocabulary of the stage, copied from frontend/src/stage/catalog.ts (the API's
// app/Support/Catalog.php accepts exactly these keys). Keep the three in step.

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

export const EFFECTS: { id: EffectId; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'fireworks', label: 'Fireworks' },
  { id: 'confetti', label: 'Confetti' },
  { id: 'flags', label: 'Banderitas' },
  { id: 'applause', label: 'Applause' },
  { id: 'sparkle', label: 'Sparkles' },
  { id: 'hearts', label: 'Hearts' },
]

export const SOUNDS: { id: BuiltinSoundId; label: string; color: string }[] = [
  { id: 'kaching', label: 'Ka-ching', color: '#C6F36B' },
  { id: 'applause', label: 'Applause', color: '#C6F36B' },
  { id: 'wow', label: 'Wow', color: '#F5C542' },
  { id: 'laugh', label: 'Laugh', color: '#F5C542' },
  { id: 'drumroll', label: 'Drumroll', color: '#8AB4FF' },
  { id: 'ding', label: 'Ding', color: '#8AB4FF' },
  { id: 'airhorn', label: 'Air horn', color: '#F2A3B8' },
  { id: 'rimshot', label: 'Ba-dum-tss', color: '#F2A3B8' },
  { id: 'fireworks', label: 'Fireworks', color: '#F5C542' },
  { id: 'bang', label: 'Bang', color: '#FF5A36' },
  { id: 'boo', label: 'Boo', color: '#B9A3FF' },
  { id: 'crickets', label: 'Crickets', color: '#7FD8C9' },
  { id: 'gun', label: 'Gunshot', color: '#FF5A36' },
]

export const SOUND_BY_ID = Object.fromEntries(SOUNDS.map((s) => [s.id, s])) as Record<BuiltinSoundId, (typeof SOUNDS)[number]>

export function isBuiltinSound(ref: string | null | undefined): ref is BuiltinSoundId {
  return typeof ref === 'string' && ref in SOUND_BY_ID
}

export const AUTO_HIDES: { id: AutoHide; label: string }[] = [
  { id: 0, label: 'Never' },
  { id: 3, label: '3 sec' },
  { id: 5, label: '5 sec' },
  { id: 10, label: '10 sec' },
]

/** Same limits as the API (POPUP_SIZE in the web catalog). */
export const POPUP_SIZE = { min: 40, max: 1500, default: 100 } as const

export const MAX_POPUPS_ON_SCREEN = 12

export interface PlatformInfo {
  id: Platform
  label: string
  /** Filled in for the seller; empty means they paste the one their platform shows. */
  server: string
  note: string
  /** The platform's page with the key, opened in the phone's browser, and how to copy it there. */
  keyPage?: { label: string; url: string; steps: string[] }
}

// These pages only show the key in their desktop layout, hence the "Desktop site" step.
const DESKTOP_SITE = 'Tap ⋮ at the top right and tick Desktop site. If you don’t see it, tap Open in Chrome first.'

export const PLATFORMS: PlatformInfo[] = [
  {
    id: 'facebook',
    label: 'Facebook',
    server: 'rtmps://live-api-s.facebook.com:443/rtmp/',
    note: 'Find it in Facebook Live Producer → Streaming software.',
    keyPage: {
      label: 'Open Facebook Live Producer',
      url: 'https://www.facebook.com/live/producer',
      steps: [
        'Tap the button below and log in to Facebook if asked.',
        DESKTOP_SITE,
        'Choose Streaming software and copy the stream key. If there’s a persistent stream key option, turn it on so the key keeps working.',
        'Come back here and tap Paste next to Stream key.',
      ],
    },
  },
  {
    id: 'youtube',
    label: 'YouTube',
    server: 'rtmp://a.rtmp.youtube.com/live2',
    note: 'Find it in YouTube Studio → Go live → Stream.',
    keyPage: {
      label: 'Open YouTube Studio',
      url: 'https://studio.youtube.com',
      steps: [
        'Tap the button below and log in to YouTube if asked.',
        DESKTOP_SITE,
        'Tap Create → Go live, choose Stream, and copy the stream key.',
        'Come back here and tap Paste next to Stream key.',
      ],
    },
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    server: '',
    note: 'Only TikTok accounts with stream key access get a server URL and key. Copy both from TikTok LIVE Center.',
    keyPage: {
      label: 'Open TikTok LIVE Center',
      url: 'https://livecenter.tiktok.com/producer',
      steps: [
        'Tap the button below and log in to TikTok if asked.',
        DESKTOP_SITE,
        'Add a title, then tap the button that shows the server URL and stream key.',
        'Copy the server URL, come back and tap Paste next to Server URL. Do the same for the stream key.',
        'TikTok often gives a new key for each live. If a live won’t start, get a fresh key here.',
      ],
    },
  },
  { id: 'custom', label: 'Other', server: '', note: 'Any RTMP or RTMPS server, like Restream or your own.' },
]

export const PLATFORM_BY_ID = Object.fromEntries(PLATFORMS.map((p) => [p.id, p])) as Record<Platform, PlatformInfo>
