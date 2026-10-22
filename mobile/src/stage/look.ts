import type { PopupLook, Position } from '@/api/types'
import { POPUP_SIZE, PRESET_BY_ID, TEXT_COLORS, type PopupShape } from '@/catalog'
import { absoluteUrl } from '@/config'

/**
 * Everything needed to draw one popup, in numbers (the web's frontend/src/stage/look.ts
 * uses CSS strings for the same rules). Sizes are stage units: 1u = 1% of the stage's
 * shorter side, so a popup looks the same on the phone preview, in the live stream and on
 * the website's clean screen.
 */
export interface PopupDrawSpec {
  key: string
  kind: 'text' | 'image'
  text: string
  imageUrl: string | null
  bg: string
  fg: string
  /** Border colour and width (in em of the font size); null = no border. */
  borderColor: string | null
  borderEm: number
  shape: PopupShape
  rotDeg: number
  /** Font size in stage units. */
  fontU: number
  /** Image height in stage units. */
  imageU: number
  /** Where the popup's anchor sits, as a fraction of the stage width / height. */
  anchorX: number
  anchorY: number
  /** How the box hangs off the anchor: 0 = starts there, -0.5 = centred, -1 = ends there. */
  alignX: number
  alignY: number
}

// Text and image sizes at 100% (the original "Medium"); popup size scales both.
const FONT_U = 6.2
const IMAGE_U = 24.4

/** Popup size percent → scale factor, kept within the allowed range. */
export function sizeScale(size: number): number {
  const percent = Number.isFinite(size) ? size : POPUP_SIZE.default
  return Math.min(POPUP_SIZE.max, Math.max(POPUP_SIZE.min, percent)) / 100
}

const ROWS: Record<string, [number, number]> = { t: [0.06, 0], m: [0.5, -0.5], b: [0.94, -1] }
const COLS: Record<string, [number, number]> = { l: [0.05, 0], c: [0.5, -0.5], r: [0.95, -1] }

/** The 9-grid spots, with the same margins as the web (6% top/bottom, 5% left/right). */
export function placement(position: Position): { anchorX: number; anchorY: number; alignX: number; alignY: number } {
  const [anchorY, alignY] = ROWS[position.charAt(0)] ?? ROWS.m!
  const [anchorX, alignX] = COLS[position.charAt(1)] ?? COLS.c!
  return { anchorX, anchorY, alignX, alignY }
}

export function isFreelyPlaced(p: Pick<PopupLook, 'x' | 'y'>): p is { x: number; y: number } {
  return p.x !== null && p.y !== null && Number.isFinite(p.x) && Number.isFinite(p.y)
}

function popupPlacement(p: Pick<PopupLook, 'position' | 'x' | 'y'>) {
  if (isFreelyPlaced(p)) {
    const clamp = (v: number) => Math.min(100, Math.max(0, v)) / 100
    return { anchorX: clamp(p.x), anchorY: clamp(p.y), alignX: -0.5, alignY: -0.5 }
  }
  return placement(p.position)
}

/** "-6deg" → -6 */
export function parseDeg(rot: string): number {
  const n = Number.parseFloat(rot)
  return Number.isFinite(n) ? n : 0
}

/** "0.12em solid #F5C542" → { em: 0.12, color: "#F5C542" } */
export function parseBorder(border: string | undefined): { em: number; color: string | null } {
  if (!border) return { em: 0, color: null }
  const match = /^([\d.]+)em\s+solid\s+(#[0-9a-f]{3,8})$/i.exec(border.trim())
  if (!match) return { em: 0, color: null }
  const em = Number.parseFloat(match[1]!)
  return em > 0 ? { em, color: match[2]! } : { em: 0, color: null }
}

/** Plain text shown for a popup. */
export function popupText(p: Pick<PopupLook, 'kind' | 'preset_key' | 'text' | 'label'>): string {
  if (p.kind === 'preset' && p.preset_key) return PRESET_BY_ID[p.preset_key]?.text ?? p.label ?? ''
  if (p.kind === 'text') return p.text ?? ''
  return p.label ?? 'Image'
}

export function resolveLook(p: PopupLook): PopupDrawSpec {
  const base = {
    key: p.key,
    fontU: FONT_U * sizeScale(p.size),
    imageU: IMAGE_U * sizeScale(p.size),
    ...popupPlacement(p),
  }

  if (p.kind === 'image') {
    return {
      ...base,
      kind: 'image',
      text: p.label ?? 'Image',
      // The API returns uploads as "/storage/…"; the native streamer only loads full addresses.
      imageUrl: absoluteUrl(p.media_url),
      bg: 'transparent',
      fg: '#0D0C10',
      borderColor: null,
      borderEm: 0,
      shape: 'tag',
      rotDeg: 0,
    }
  }

  const preset = p.kind === 'preset' && p.preset_key ? PRESET_BY_ID[p.preset_key] : undefined
  if (preset) {
    const border = parseBorder(preset.border)
    return {
      ...base,
      kind: 'text',
      text: preset.text,
      imageUrl: null,
      bg: preset.bg,
      fg: preset.fg,
      borderColor: border.color,
      borderEm: border.em,
      shape: preset.shape,
      rotDeg: parseDeg(preset.rot),
    }
  }

  const color = TEXT_COLORS.find((c) => c.id === p.color) ?? TEXT_COLORS[0]!
  return {
    ...base,
    kind: 'text',
    text: p.text ?? '',
    imageUrl: null,
    bg: color.bg,
    fg: color.fg,
    borderColor: null,
    borderEm: 0,
    shape: 'tag',
    rotDeg: -3,
  }
}
