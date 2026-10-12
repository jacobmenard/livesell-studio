import type { Orientation, Resolution } from '../lib/types'

export type Rect = [sx: number, sy: number, sw: number, sh: number]

/** Pixel size of the picture sent to the live. */
export function outputSize(orientation: Orientation, resolution: Resolution): { width: number; height: number } {
  const [long, short] = resolution === '720p' ? [1280, 720] : [1920, 1080]
  return orientation === 'portrait' ? { width: short, height: long } : { width: long, height: short }
}

/**
 * The part of a source (camera frame or picture) that fills the target shape without
 * stretching ("cover"), zoomed towards the centre. `zoom` is the 0–100 slider (1×–2×).
 */
export function coverCrop(srcW: number, srcH: number, targetW: number, targetH: number, zoom = 0): Rect {
  if (srcW <= 0 || srcH <= 0 || targetW <= 0 || targetH <= 0) return [0, 0, Math.max(srcW, 0), Math.max(srcH, 0)]
  const target = targetW / targetH
  let w = srcW
  let h = srcH
  if (srcW / srcH > target) w = srcH * target
  else h = srcW / target
  const scale = 1 + Math.min(Math.max(zoom, 0), 100) / 100
  w /= scale
  h /= scale
  return [(srcW - w) / 2, (srcH - h) / 2, w, h]
}

/**
 * Lowest zoom-slider value per shape. Portrait can zoom out below 0 because a landscape
 * webcam only fills a portrait stage by cropping away about two thirds of its width.
 */
export const MIN_ZOOM: Record<Orientation, number> = { portrait: -100, landscape: 0 }

/** Where the camera goes: the part of the frame to draw (`src`) and where on the stage (`dst`). */
export interface CameraPlacement {
  src: Rect
  dst: Rect
}

/**
 * Places a camera frame on the stage for the zoom slider (−100…100). From 0 up it is
 * `coverCrop`: the frame fills the stage, zoomed 1×–2×. Below 0 it zooms out towards
 * "contain": at −100 the whole frame is visible and the stage shows above and below it.
 */
export function placeCamera(srcW: number, srcH: number, targetW: number, targetH: number, zoom = 0): CameraPlacement {
  const fill: Rect = [0, 0, targetW, targetH]
  if (zoom >= 0 || srcW <= 0 || srcH <= 0 || targetW <= 0 || targetH <= 0) {
    return { src: coverCrop(srcW, srcH, targetW, targetH, zoom), dst: fill }
  }

  const cover = Math.max(targetW / srcW, targetH / srcH)
  const contain = Math.min(targetW / srcW, targetH / srcH)
  const scale = cover + (contain - cover) * (Math.min(-zoom, 100) / 100)

  // Per axis: wider than the stage → crop the frame; narrower → centre it on the stage.
  const axis = (src: number, target: number): [start: number, size: number, at: number, length: number] => {
    const drawn = src * scale
    return drawn > target ? [(src - target / scale) / 2, target / scale, 0, target] : [0, src, (target - drawn) / 2, drawn]
  }
  const [sx, sw, dx, dw] = axis(srcW, targetW)
  const [sy, sh, dy, dh] = axis(srcH, targetH)
  return { src: [sx, sy, sw, sh], dst: [dx, dy, dw, dh] }
}

/** Confidence (0..1) → alpha (0..255) with a soft edge around the person. */
export function maskAlpha(confidence: number): number {
  const a = (confidence - 0.25) / 0.5
  return Math.round(Math.min(1, Math.max(0, a)) * 255)
}
