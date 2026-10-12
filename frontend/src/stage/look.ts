import type { PopupLook, Position } from '../lib/types'
import { POPUP_SIZE, PRESET_BY_ID, TEXT_COLORS, type PopupShape } from './catalog'

/**
 * Everything needed to draw one popup. Sizes are in stage units (1u = 1% of the
 * stage's shorter side), so a popup looks the same in the small preview, a
 * dashboard thumbnail and the full 1080×1920 clean screen.
 */
export interface ResolvedLook {
  kind: 'text' | 'image'
  text: string
  imageUrl: string | null
  bg: string
  fg: string
  border: string
  shape: PopupShape
  rot: string
  /** Font size in stage units. */
  fontU: number
  /** Image height in stage units. */
  imageU: number
  top: string
  left: string
  tx: string
  ty: string
}

// Text and image sizes at 100% (the original "Medium"); popup size scales both.
const FONT_U = 6.2
const IMAGE_U = 24.4

/** The popup's size as a scale factor, kept within the allowed range. */
export function sizeScale(size: number): number {
  const percent = Number.isFinite(size) ? size : POPUP_SIZE.default
  return Math.min(POPUP_SIZE.max, Math.max(POPUP_SIZE.min, percent)) / 100
}
const ROWS: Record<string, [string, string]> = { t: ['6%', '0%'], m: ['50%', '-50%'], b: ['94%', '-100%'] }
const COLS: Record<string, [string, string]> = { l: ['5%', '0%'], c: ['50%', '-50%'], r: ['95%', '-100%'] }

export function placement(position: Position) {
  const [top, ty] = ROWS[position.charAt(0)] ?? ROWS.m
  const [left, tx] = COLS[position.charAt(1)] ?? COLS.c
  return { top, ty, left, tx }
}

/** True when the popup was dragged to its own spot (centred on x / y) rather than a 9-grid spot. */
export function isFreelyPlaced(p: Pick<PopupLook, 'x' | 'y'>): p is { x: number; y: number } {
  return p.x !== null && p.y !== null && Number.isFinite(p.x) && Number.isFinite(p.y)
}

function popupPlacement(p: Pick<PopupLook, 'position' | 'x' | 'y'>) {
  return isFreelyPlaced(p) ? { top: `${p.y}%`, left: `${p.x}%`, tx: '-50%', ty: '-50%' } : placement(p.position)
}

/** Whether effects should fall downwards (popup near the top) rather than rise. */
export function nearTop(p: Pick<PopupLook, 'position' | 'x' | 'y'>): boolean {
  return isFreelyPlaced(p) ? p.y < 34 : p.position.startsWith('t')
}

/** Plain text shown for a popup (never interpreted as HTML). */
export function popupText(p: Pick<PopupLook, 'kind' | 'preset_key' | 'text' | 'label'>): string {
  if (p.kind === 'preset' && p.preset_key) return PRESET_BY_ID[p.preset_key]?.text ?? p.label ?? ''
  if (p.kind === 'text') return p.text ?? ''
  return p.label ?? 'Image'
}

export function resolveLook(p: PopupLook): ResolvedLook {
  const base = {
    fontU: FONT_U * sizeScale(p.size),
    imageU: IMAGE_U * sizeScale(p.size),
    ...popupPlacement(p),
  }

  if (p.kind === 'image') {
    return { ...base, kind: 'image', text: p.label ?? 'Image', imageUrl: p.media_url ?? null, bg: 'transparent', fg: '#0D0C10', border: '0 solid transparent', shape: 'tag', rot: '0deg' }
  }

  if (p.kind === 'preset' && p.preset_key && PRESET_BY_ID[p.preset_key]) {
    const preset = PRESET_BY_ID[p.preset_key]
    return {
      ...base,
      kind: 'text',
      text: preset.text,
      imageUrl: null,
      bg: preset.bg,
      fg: preset.fg,
      border: preset.border ?? '0 solid transparent',
      shape: preset.shape,
      rot: preset.rot,
    }
  }

  const color = TEXT_COLORS.find((c) => c.id === p.color) ?? TEXT_COLORS[0]
  return {
    ...base,
    kind: 'text',
    text: p.text ?? '',
    imageUrl: null,
    bg: color.bg,
    fg: color.fg,
    border: '0 solid transparent',
    shape: 'tag',
    rot: '-3deg',
  }
}
