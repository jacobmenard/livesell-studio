/**
 * Colour filters for the whole camera picture, in the style of the filters sellers know from
 * TikTok (Vintage, Film, B&W…). Each is a small colour grade applied on the GPU with the
 * camera look (see enhance.ts), with a strength slider like TikTok's.
 *
 * Keep the ids in sync with the API (App\Support\Catalog::CAMERA_FILTERS).
 */
import type { CameraFilterId } from '../lib/types'

export type { CameraFilterId }

/** One colour grade. Every field is optional; leaving it out means "no change". */
export interface FilterGrade {
  /** Per-channel multiply (tints the picture), e.g. [1.05, 1, 0.92] for warm. */
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

export const CAMERA_FILTERS: { id: CameraFilterId; label: string; swatch: string; grade: FilterGrade }[] = [
  { id: 'none', label: 'Normal', swatch: 'linear-gradient(135deg,#f3d6c4,#c99b84)', grade: {} },
  // Portrait: flattering on faces.
  { id: 'fair', label: 'Fair', swatch: 'linear-gradient(135deg,#fff1ee,#f2c9c4)', grade: { gain: [1.05, 1.02, 1.03], contrast: 0.92, saturation: 0.95, fade: 0.04, highlights: [0.03, 0.01, 0.02] } },
  { id: 'soft', label: 'Soft', swatch: 'linear-gradient(135deg,#f7e3d6,#d9b8a8)', grade: { gain: [1.03, 1.0, 0.97], contrast: 0.86, saturation: 0.9, fade: 0.07 } },
  { id: 'glow', label: 'Glow', swatch: 'linear-gradient(135deg,#ffe9c7,#f5b78f)', grade: { gain: [1.08, 1.03, 0.96], contrast: 0.95, saturation: 1.05, highlights: [0.05, 0.03, 0.0] } },
  { id: 'clear', label: 'Clear', swatch: 'linear-gradient(135deg,#e8f4ff,#9ec3e6)', grade: { gain: [0.99, 1.0, 1.03], contrast: 1.1, saturation: 1.08 } },
  // Mood: colour styles.
  { id: 'warm', label: 'Golden', swatch: 'linear-gradient(135deg,#ffd27a,#d98a3c)', grade: { gain: [1.08, 1.02, 0.88], saturation: 1.05, highlights: [0.03, 0.015, 0] } },
  { id: 'cool', label: 'Cool', swatch: 'linear-gradient(135deg,#cfe6ff,#5f8fc8)', grade: { gain: [0.93, 0.99, 1.08], saturation: 0.95, shadows: [0, 0.01, 0.04] } },
  { id: 'vivid', label: 'Vivid', swatch: 'linear-gradient(135deg,#ff5f6d,#ffc371)', grade: { contrast: 1.12, saturation: 1.35 } },
  { id: 'pastel', label: 'Pastel', swatch: 'linear-gradient(135deg,#fbd3e9,#bbd2f6)', grade: { contrast: 0.88, saturation: 0.8, fade: 0.1, highlights: [0.03, 0, 0.03], shadows: [0, 0.02, 0.04] } },
  { id: 'dreamy', label: 'Dreamy', swatch: 'linear-gradient(135deg,#ffd6e8,#c9a7ff)', grade: { gain: [1.04, 0.99, 1.04], contrast: 0.85, saturation: 0.9, fade: 0.12, highlights: [0.05, 0.0, 0.04] } },
  { id: 'neon', label: 'Neon night', swatch: 'linear-gradient(135deg,#ff2bd6,#21d4fd)', grade: { contrast: 1.1, saturation: 1.2, shadows: [0, 0.04, 0.08], highlights: [0.07, 0, 0.05], vignette: 0.3 } },
  // Film: retro looks.
  { id: 'vintage', label: 'Vintage', swatch: 'linear-gradient(135deg,#e8d1a7,#9c7a4e)', grade: { gain: [1.06, 1.0, 0.86], contrast: 0.9, saturation: 0.75, fade: 0.12, shadows: [0.01, 0.03, 0.0], vignette: 0.4, grain: 0.05 } },
  { id: 'film', label: 'Film', swatch: 'linear-gradient(135deg,#f2b36b,#2c6e7a)', grade: { contrast: 0.95, saturation: 0.9, fade: 0.08, shadows: [-0.01, 0.03, 0.05], highlights: [0.05, 0.02, -0.02], grain: 0.06 } },
  { id: 'retro', label: 'Retro', swatch: 'linear-gradient(135deg,#f6a6a0,#8c5a7a)', grade: { gain: [1.06, 0.96, 0.98], contrast: 0.92, saturation: 0.8, fade: 0.1, highlights: [0.04, 0.0, 0.02], vignette: 0.3, grain: 0.04 } },
  { id: 'cinematic', label: 'Cinematic', swatch: 'linear-gradient(135deg,#f4a259,#1f4e5f)', grade: { contrast: 1.12, saturation: 0.95, shadows: [-0.02, 0.02, 0.06], highlights: [0.06, 0.02, -0.03], vignette: 0.45 } },
  // Black and white.
  { id: 'bw', label: 'B&W', swatch: 'linear-gradient(135deg,#f2f2f2,#3a3a3a)', grade: { mono: 1, contrast: 1.05 } },
  { id: 'noir', label: 'Noir', swatch: 'linear-gradient(135deg,#9a9a9a,#000000)', grade: { mono: 1, contrast: 1.3, vignette: 0.55, grain: 0.04 } },
]

export const DEFAULT_FILTER_STRENGTH = 80

export const isCameraFilter = (id: string): id is CameraFilterId => CAMERA_FILTERS.some((f) => f.id === id)

export function filterGrade(id: CameraFilterId): FilterGrade {
  return CAMERA_FILTERS.find((f) => f.id === id)?.grade ?? {}
}

/** Canvas-filter stand-in when WebGL isn't available: only black and white survives. */
export function filterAsCssFilter(id: CameraFilterId, strength: number): string {
  const mono = filterGrade(id).mono ?? 0
  return mono > 0 ? `grayscale(${((mono * strength) / 100).toFixed(2)})` : ''
}
