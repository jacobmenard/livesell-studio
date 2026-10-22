import type { CameraFilterId } from '@/api/types'

/**
 * Colour filters for the whole camera picture (Vintage, Film, B&W…), copied from
 * frontend/src/stage/filters.ts so the phone's live looks like the website's. Keep the
 * two lists, and the API's Catalog::CAMERA_FILTERS, in step.
 */

/** One colour grade. Every field is optional; leaving it out means "no change". */
export interface FilterGrade {
  /** Per-channel multiply (tints the picture). */
  gain?: [number, number, number]
  /** 1 = unchanged. */
  contrast?: number
  /** 1 = unchanged, 0 = grey. */
  saturation?: number
  /** Raised blacks / softened whites, like faded film (0–0.3). */
  fade?: number
  /** Colour pushed into the shadows and into the highlights (split toning). */
  shadows?: [number, number, number]
  highlights?: [number, number, number]
  /** 1 = black and white. */
  mono?: number
  /** Darker corners (0–1). */
  vignette?: number
  /** Film grain (0–0.12). */
  grain?: number
}

export interface CameraFilter {
  id: CameraFilterId
  label: string
  /** Two colours for the picker tile. */
  swatch: [string, string]
  grade: FilterGrade
}

export const CAMERA_FILTERS: CameraFilter[] = [
  { id: 'none', label: 'Normal', swatch: ['#f3d6c4', '#c99b84'], grade: {} },
  // Portrait: flattering on faces.
  { id: 'fair', label: 'Fair', swatch: ['#fff1ee', '#f2c9c4'], grade: { gain: [1.05, 1.02, 1.03], contrast: 0.92, saturation: 0.95, fade: 0.04, highlights: [0.03, 0.01, 0.02] } },
  { id: 'soft', label: 'Soft', swatch: ['#f7e3d6', '#d9b8a8'], grade: { gain: [1.03, 1.0, 0.97], contrast: 0.86, saturation: 0.9, fade: 0.07 } },
  { id: 'glow', label: 'Glow', swatch: ['#ffe9c7', '#f5b78f'], grade: { gain: [1.08, 1.03, 0.96], contrast: 0.95, saturation: 1.05, highlights: [0.05, 0.03, 0.0] } },
  { id: 'clear', label: 'Clear', swatch: ['#e8f4ff', '#9ec3e6'], grade: { gain: [0.99, 1.0, 1.03], contrast: 1.1, saturation: 1.08 } },
  // Mood: colour styles.
  { id: 'warm', label: 'Golden', swatch: ['#ffd27a', '#d98a3c'], grade: { gain: [1.08, 1.02, 0.88], saturation: 1.05, highlights: [0.03, 0.015, 0] } },
  { id: 'cool', label: 'Cool', swatch: ['#cfe6ff', '#5f8fc8'], grade: { gain: [0.93, 0.99, 1.08], saturation: 0.95, shadows: [0, 0.01, 0.04] } },
  { id: 'vivid', label: 'Vivid', swatch: ['#ff5f6d', '#ffc371'], grade: { contrast: 1.12, saturation: 1.35 } },
  { id: 'pastel', label: 'Pastel', swatch: ['#fbd3e9', '#bbd2f6'], grade: { contrast: 0.88, saturation: 0.8, fade: 0.1, highlights: [0.03, 0, 0.03], shadows: [0, 0.02, 0.04] } },
  { id: 'dreamy', label: 'Dreamy', swatch: ['#ffd6e8', '#c9a7ff'], grade: { gain: [1.04, 0.99, 1.04], contrast: 0.85, saturation: 0.9, fade: 0.12, highlights: [0.05, 0.0, 0.04] } },
  { id: 'neon', label: 'Neon night', swatch: ['#ff2bd6', '#21d4fd'], grade: { contrast: 1.1, saturation: 1.2, shadows: [0, 0.04, 0.08], highlights: [0.07, 0, 0.05], vignette: 0.3 } },
  // Film: retro looks.
  { id: 'vintage', label: 'Vintage', swatch: ['#e8d1a7', '#9c7a4e'], grade: { gain: [1.06, 1.0, 0.86], contrast: 0.9, saturation: 0.75, fade: 0.12, shadows: [0.01, 0.03, 0.0], vignette: 0.4, grain: 0.05 } },
  { id: 'film', label: 'Film', swatch: ['#f2b36b', '#2c6e7a'], grade: { contrast: 0.95, saturation: 0.9, fade: 0.08, shadows: [-0.01, 0.03, 0.05], highlights: [0.05, 0.02, -0.02], grain: 0.06 } },
  { id: 'retro', label: 'Retro', swatch: ['#f6a6a0', '#8c5a7a'], grade: { gain: [1.06, 0.96, 0.98], contrast: 0.92, saturation: 0.8, fade: 0.1, highlights: [0.04, 0.0, 0.02], vignette: 0.3, grain: 0.04 } },
  { id: 'cinematic', label: 'Cinematic', swatch: ['#f4a259', '#1f4e5f'], grade: { contrast: 1.12, saturation: 0.95, shadows: [-0.02, 0.02, 0.06], highlights: [0.06, 0.02, -0.03], vignette: 0.45 } },
  // Black and white.
  { id: 'bw', label: 'B&W', swatch: ['#f2f2f2', '#3a3a3a'], grade: { mono: 1, contrast: 1.05 } },
  { id: 'noir', label: 'Noir', swatch: ['#9a9a9a', '#000000'], grade: { mono: 1, contrast: 1.3, vignette: 0.55, grain: 0.04 } },
]

export const DEFAULT_FILTER_STRENGTH = 80

export function isCameraFilter(id: unknown): id is CameraFilterId {
  return typeof id === 'string' && CAMERA_FILTERS.some((f) => f.id === id)
}

export function filterGrade(id: CameraFilterId): FilterGrade {
  return CAMERA_FILTERS.find((f) => f.id === id)?.grade ?? {}
}

/** The camera look sliders (0–100; 50 = unchanged, smoothing 0 = off), as on the website. */
export interface CameraLook {
  brightness: number
  contrast: number
  saturation: number
  warmth: number
  smoothing: number
}

export const NEUTRAL_LOOK: CameraLook = { brightness: 50, contrast: 50, saturation: 50, warmth: 50, smoothing: 0 }

/** One-tap starting points (frontend/src/stage/enhance.ts LOOK_PRESETS). */
export const LOOK_PRESETS: { id: string; label: string; look: CameraLook }[] = [
  { id: 'natural', label: 'Natural', look: NEUTRAL_LOOK },
  { id: 'bright', label: 'Bright', look: { brightness: 60, contrast: 55, saturation: 55, warmth: 50, smoothing: 20 } },
  { id: 'warm', label: 'Warm', look: { brightness: 55, contrast: 52, saturation: 56, warmth: 66, smoothing: 30 } },
  { id: 'glow', label: 'Soft glow', look: { brightness: 56, contrast: 47, saturation: 52, warmth: 56, smoothing: 65 } },
]

export const LOOK_SLIDERS: { key: keyof CameraLook; label: string; low: string; high: string; hint?: string }[] = [
  { key: 'brightness', label: 'Brightness', low: 'Darker', high: 'Brighter' },
  { key: 'contrast', label: 'Contrast', low: 'Softer', high: 'Punchier' },
  { key: 'saturation', label: 'Color', low: 'Muted', high: 'Vivid' },
  { key: 'warmth', label: 'Warmth', low: 'Cooler', high: 'Warmer' },
  { key: 'smoothing', label: 'Face enhance', low: 'Off', high: 'Strong', hint: 'Evens out skin and adds a soft glow. Eyes, hair and your products stay sharp.' },
]

export function sameLook(a: CameraLook, b: CameraLook): boolean {
  return (Object.keys(NEUTRAL_LOOK) as (keyof CameraLook)[]).every((k) => a[k] === b[k])
}
