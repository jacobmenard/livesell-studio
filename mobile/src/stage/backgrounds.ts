import type { ImageSourcePropType } from 'react-native'

import type { BackgroundMode, BackgroundPresetId, BackgroundSettings, CameraSettings, ForegroundDock, ForegroundSettings, KeyColor } from '@/api/types'

/** The six built-in backdrops (frontend/src/stage/catalog.ts BACKGROUND_PRESETS). */
export const BACKGROUND_PRESETS: { id: BackgroundPresetId; label: string; tone: string; thumb: ImageSourcePropType }[] = [
  { id: 'loft', label: 'Studio loft', tone: '#3A3424', thumb: require('../../assets/backgrounds/loft.jpg') },
  { id: 'rack', label: 'Boutique rack', tone: '#24324A', thumb: require('../../assets/backgrounds/rack.jpg') },
  { id: 'kitchen', label: 'Kitchen set', tone: '#4A2E24', thumb: require('../../assets/backgrounds/kitchen.jpg') },
  { id: 'vanity', label: 'Vanity corner', tone: '#402433', thumb: require('../../assets/backgrounds/vanity.jpg') },
  { id: 'brand', label: 'Brand wall', tone: '#2B2148', thumb: require('../../assets/backgrounds/brand.jpg') },
  { id: 'white', label: 'Clean white', tone: '#E9E4DA', thumb: require('../../assets/backgrounds/white.jpg') },
]

export const BACKGROUND_MODES: { id: BackgroundMode; label: string; help: string }[] = [
  { id: 'none', label: 'None', help: 'Viewers see your real room behind you.' },
  { id: 'blur', label: 'Blur', help: 'Softly blurs your room so the focus stays on you.' },
  { id: 'image', label: 'Picture', help: 'Swaps your room for a picture. No green cloth needed.' },
  { id: 'green', label: 'Green screen', help: 'Cleanest edges. Hang a green or blue cloth behind you, then pick the picture to show.' },
]

/** Key colours as linear 0–1 RGB, exactly the website's (catalog.ts KEY_COLORS). */
export const KEY_COLORS: { id: KeyColor; label: string; swatch: string; rgb: [number, number, number] }[] = [
  { id: 'green', label: 'Green', swatch: '#1E9E57', rgb: [0.0, 0.69, 0.25] },
  { id: 'blue', label: 'Blue', swatch: '#2F6BFF', rgb: [0.0, 0.28, 0.73] },
]

export const FOREGROUND_DOCKS: { id: ForegroundDock; label: string }[] = [
  { id: 'bottom', label: 'Bottom' },
  { id: 'top', label: 'Top' },
]

export function isBackgroundPreset(id: unknown): id is BackgroundPresetId {
  return typeof id === 'string' && BACKGROUND_PRESETS.some((b) => b.id === id)
}

/** The API's defaults (backend/app/Services/SetupDefaults.php), for setups missing a field. */
export const DEFAULT_CAMERA: CameraSettings = {
  source: 'camera',
  device_label: null,
  mirror: false,
  brightness: 50,
  contrast: 50,
  saturation: 50,
  warmth: 50,
  smoothing: 0,
  effect: 'none',
  filter: 'none',
  filter_strength: 80,
  zoom: 0,
  audio: true,
}

export const DEFAULT_BACKGROUND: BackgroundSettings = { mode: 'image', preset: 'rack', media_id: null, key_color: 'green', similarity: 42, smoothness: 18 }

export const DEFAULT_FOREGROUND: ForegroundSettings = { enabled: false, media_id: null, dock: 'bottom' }
