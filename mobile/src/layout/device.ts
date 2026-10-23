import { useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/**
 * Phone or tablet, and how much room a screen has. Android's own line between the two:
 * a screen whose shorter side is at least 600 dp is a tablet (it's also where Android 16
 * stops honouring portrait/landscape locks, so tablets must work both ways round).
 */
export const TABLET_MIN_DP = 600
/** Wide enough for side-by-side panes (a tablet held sideways, or a big window). */
export const WIDE_MIN_DP = 900

export interface Size {
  width: number
  height: number
}

export interface Insets {
  top: number
  bottom: number
  left: number
  right: number
}

export interface DeviceLayout {
  /** Tablet layouts: this window's shorter side is at least 600 dp. */
  tablet: boolean
  /** Room for panes side by side. */
  wide: boolean
  landscape: boolean
  width: number
  height: number
}

/** The device class decides orientation: phones stay upright, tablets turn freely. */
export function isTabletScreen(screen: Size): boolean {
  return Math.min(screen.width, screen.height) >= TABLET_MIN_DP
}

export function deviceLayout(window: Size): DeviceLayout {
  return {
    tablet: Math.min(window.width, window.height) >= TABLET_MIN_DP,
    wide: window.width >= WIDE_MIN_DP,
    landscape: window.width > window.height,
    width: window.width,
    height: window.height,
  }
}

export function useDeviceLayout(): DeviceLayout {
  const { width, height } = useWindowDimensions()
  return deviceLayout({ width, height })
}

/** How many setup cards fit side by side. */
export function gridColumns(layout: DeviceLayout): number {
  if (!layout.tablet) return 1
  return layout.width >= 1100 ? 3 : 2
}

// ---- the editor's preview ------------------------------------------------------------------

/**
 * The editor preview's size: phones as before (168 × 300 / 320 × 180); upright tablets a
 * bigger picture; the three-pane tablet editor fills its measured pane (16 dp margin).
 */
export function editorPreviewSize(portraitSetup: boolean, pane: Size | null, tabletWidth: number): { stageW: number; stageH: number } {
  if (pane) {
    const maxW = Math.max(0, pane.width - 32)
    const maxH = Math.max(0, pane.height - 32)
    const ratio = portraitSetup ? 9 / 16 : 16 / 9
    let w = maxW
    let h = w / ratio
    if (h > maxH) {
      h = maxH
      w = h * ratio
    }
    return { stageW: Math.floor(w), stageH: Math.floor(h) }
  }
  if (tabletWidth > 0) {
    if (portraitSetup) return { stageW: 236, stageH: 420 }
    const w = Math.min(tabletWidth - 64, 640)
    return { stageW: Math.round(w), stageH: Math.round((w * 9) / 16) }
  }
  return portraitSetup ? { stageW: 168, stageH: 300 } : { stageW: 320, stageH: 180 }
}

// ---- the live screen --------------------------------------------------------------------

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Where things go on the live screen:
 *  - phone: as before (camera full screen; a landscape live in a band across the middle);
 *  - overlay: tablet upright with a portrait live: camera full screen, controls in a tray;
 *  - columns: tablet sideways: the picture on the left, controls in a panel on the right
 *    (a landscape live also gets its popups under the picture);
 *  - stacked: tablet upright with a landscape live: picture on top, controls below.
 * The camera keeps one place in the view tree in every layout (only its box moves), so
 * turning the tablet never restarts the camera or the live.
 */
export type LiveMode = 'phone' | 'overlay' | 'columns' | 'stacked'

export interface LiveLayout {
  mode: LiveMode
  /** The camera picture. */
  stage: Rect
  /** The controls (columns and stacked). */
  panel: Rect | null
  /** Popups under a landscape picture (columns). */
  under: Rect | null
  /** The tablet is held across the live's shape: the picture is a cropped middle. */
  turn: 'upright' | 'sideways' | null
}

const GAP = 24
const PANEL_MIN = 340
const PANEL_MAX = 420
/** Room under a landscape picture for two rows of popups and their title. */
const UNDER_MIN = 210

export function liveLayout(window: Size, insets: Insets, landscapeLive: boolean): LiveLayout {
  const W = window.width
  const H = window.height
  const layout = deviceLayout(window)

  if (!layout.tablet) {
    const stage = landscapeLive ? { x: 0, y: Math.round((H - (W * 9) / 16) / 2.6), w: W, h: Math.round((W * 9) / 16) } : { x: 0, y: 0, w: W, h: H }
    return { mode: 'phone', stage, panel: null, under: null, turn: null }
  }

  const top = insets.top + GAP
  const bottom = H - insets.bottom - GAP
  const left = insets.left + GAP
  const right = W - insets.right - GAP

  if (!layout.landscape && !landscapeLive) {
    return { mode: 'overlay', stage: { x: 0, y: 0, w: W, h: H }, panel: null, under: null, turn: null }
  }

  if (!layout.landscape) {
    // Upright tablet, landscape live: picture across the top, controls under it.
    const h = Math.round((W * 9) / 16)
    const panelTop = h + GAP
    return {
      mode: 'stacked',
      stage: { x: 0, y: 0, w: W, h },
      panel: { x: left, y: panelTop, w: right - left, h: bottom - panelTop },
      under: null,
      turn: 'sideways',
    }
  }

  const availH = bottom - top
  if (landscapeLive) {
    const panelW = clamp(Math.round(W * 0.3), PANEL_MIN, PANEL_MAX)
    const areaW = right - left - panelW - GAP
    let w = areaW
    let h = Math.round((w * 9) / 16)
    if (h > availH - UNDER_MIN) {
      h = Math.max(0, availH - UNDER_MIN)
      w = Math.round((h * 16) / 9)
    }
    const stage = { x: left, y: top, w, h }
    return {
      mode: 'columns',
      stage,
      panel: { x: right - panelW, y: top, w: panelW, h: availH },
      under: { x: left, y: top + h + GAP, w: areaW, h: availH - h - GAP },
      turn: null,
    }
  }

  // Sideways tablet, portrait live: a tall picture on the left, everything else beside it.
  const h = availH
  const w = Math.round((h * 9) / 16)
  const panelX = left + w + GAP
  return {
    mode: 'columns',
    stage: { x: left, y: top, w, h },
    panel: { x: panelX, y: top, w: right - panelX, h: availH },
    under: null,
    turn: 'upright',
  }
}

export function useLiveLayout(landscapeLive: boolean): LiveLayout {
  const window = useWindowDimensions()
  const insets = useSafeAreaInsets()
  return liveLayout({ width: window.width, height: window.height }, insets, landscapeLive)
}

/** Tiles of at least `min` dp across `width`, `gap` apart: how many fit. */
export function columnsFor(width: number, min: number, gap: number, max = 12): number {
  return clamp(Math.floor((width + gap) / (min + gap)), 1, max)
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
