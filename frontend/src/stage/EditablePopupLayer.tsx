import { useCallback, useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import type { PopupLook } from '../lib/types'
import { POPUP_SIZE } from './catalog'
import { PopupView, type ResizeHandle } from './Stage'

type EditablePopup = PopupLook & { shown_at?: number }

/** What dragging, resizing or nudging a popup changes. */
export type PopupTransform = Partial<Pick<PopupLook, 'x' | 'y' | 'size'>>

// A press that moves less than this is a click (select only), so a tap never nudges a popup.
const MOVE_THRESHOLD_PX = 3
const NUDGE = 1
const NUDGE_BIG = 5

const toPercent = (value: number) => Math.round(Math.min(100, Math.max(0, value)) * 100) / 100
// Keeps a value between two edges in either order: a popup bigger than the stage can still
// be slid along, but never far enough to leave a gap at the stage's edge.
const within = (value: number, a: number, b: number) => Math.min(Math.max(a, b), Math.max(Math.min(a, b), value))

export const clampPopupSize = (size: number, max: number = POPUP_SIZE.max) =>
  Math.min(max, POPUP_SIZE.max, Math.max(POPUP_SIZE.min, Math.round(size)))

/**
 * The size at which a popup is exactly as wide as the stage. Popups scale evenly, so the
 * box grows in proportion to the size. Height doesn't limit it: a tall image may run past
 * the top and bottom.
 */
export function fitSize(size: number, box: { width: number }, stage: { width: number }): number {
  if (box.width <= 0) return POPUP_SIZE.max
  return Math.max(POPUP_SIZE.min, Math.floor((size * stage.width) / box.width))
}

/** A popup as drawn right now: its box and centre in page pixels, and the stage it sits on. */
function measure(root: HTMLElement, size: number) {
  const stageElement = root.offsetParent
  if (!(stageElement instanceof HTMLElement)) return null
  const stage = stageElement.getBoundingClientRect()
  const box = root.getBoundingClientRect()
  if (stage.width === 0 || stage.height === 0) return null
  return {
    stage,
    size,
    boxWidth: box.width,
    boxHeight: box.height,
    centerX: box.left + box.width / 2,
    centerY: box.top + box.height / 2,
    maxSize: fitSize(size, box, stage),
  }
}

export type Measured = NonNullable<ReturnType<typeof measure>>

/**
 * The popup's x / y (% of the stage) for a centre in page pixels at a given size, moved in
 * just enough that the whole popup stays on the stage (or, if it's taller than the stage,
 * that it still covers it edge to edge).
 */
export function placeOnStage(m: Measured, centerX: number, centerY: number, size: number) {
  const scale = size / m.size
  const halfWidth = (m.boxWidth * scale) / 2
  const halfHeight = (m.boxHeight * scale) / 2
  const x = within(centerX, m.stage.left + halfWidth, m.stage.right - halfWidth)
  const y = within(centerY, m.stage.top + halfHeight, m.stage.bottom - halfHeight)
  return {
    x: toPercent(((x - m.stage.left) / m.stage.width) * 100),
    y: toPercent(((y - m.stage.top) / m.stage.height) * 100),
  }
}

interface Drag extends Measured {
  key: string
  mode: 'move' | 'resize'
  startX: number
  startY: number
  /** Resizing: the point that stays still (the opposite corner or edge) and the grabbed handle. */
  anchorX: number
  anchorY: number
  handleX: number
  handleY: number
  moved: boolean
}

/**
 * Where a resize handle sits on a box, and the opposite point that stays still while it's
 * dragged: the opposite corner, or the middle of the opposite edge.
 */
export function resizeAnchor(handle: ResizeHandle, box: { left: number; top: number; right: number; bottom: number }) {
  const midX = (box.left + box.right) / 2
  const midY = (box.top + box.bottom) / 2
  const pick = (low: number, high: number, mid: number, lowKey: string, highKey: string) =>
    handle.includes(lowKey) ? [low, high] : handle.includes(highKey) ? [high, low] : [mid, mid]
  const [handleX, anchorX] = pick(box.left, box.right, midX, 'w', 'e')
  const [handleY, anchorY] = pick(box.top, box.bottom, midY, 'n', 's')
  return { handleX, handleY, anchorX, anchorY }
}

/**
 * How much bigger a box gets when its handle is dragged to (x, y), keeping the anchor still.
 * Popups scale evenly (pictures never stretch): a side handle follows the pointer across,
 * a top or bottom handle follows it up and down, a corner follows it along the diagonal.
 */
export function resizeScale(d: { anchorX: number; anchorY: number; handleX: number; handleY: number }, x: number, y: number): number {
  const vx = d.handleX - d.anchorX
  const vy = d.handleY - d.anchorY
  const length = vx * vx + vy * vy
  if (length === 0) return 1
  return ((x - d.anchorX) * vx + (y - d.anchorY) * vy) / length
}

/**
 * The editor preview's popups: drag one to move it anywhere, drag a corner or an edge to
 * resize it (evenly, with the opposite side staying put) up to the full screen width, or use
 * the arrow keys and + / − once it's selected. Popups stay on screen. The clean screen and
 * thumbnails keep using the plain PopupLayer.
 */
export function EditablePopupLayer({
  popups,
  selectedKey,
  onSelect,
  onChange,
}: {
  popups: EditablePopup[]
  selectedKey: string | null
  onSelect: (key: string) => void
  onChange: (key: string, patch: PopupTransform) => void
}) {
  const drag = useRef<Drag | null>(null)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  // Follow the pointer on the whole page, so a fast drag that leaves the popup still works.
  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      const d = drag.current
      if (!d) return
      const dx = event.clientX - d.startX
      const dy = event.clientY - d.startY
      if (!d.moved && Math.hypot(dx, dy) < MOVE_THRESHOLD_PX) return
      d.moved = true

      if (d.mode === 'move') {
        onChangeRef.current(d.key, placeOnStage(d, d.centerX + dx, d.centerY + dy, d.size))
        return
      }
      // The opposite corner or edge stays put (so a grid-spot popup becomes freely placed),
      // up to the full screen width.
      const size = clampPopupSize(d.size * Math.max(0.05, resizeScale(d, event.clientX, event.clientY)), d.maxSize)
      const scale = size / d.size
      const centerX = d.anchorX + (d.centerX - d.anchorX) * scale
      const centerY = d.anchorY + (d.centerY - d.anchorY) * scale
      onChangeRef.current(d.key, { size, ...placeOnStage(d, centerX, centerY, size) })
    }
    const end = () => {
      drag.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [])

  const begin = useCallback(
    (event: PointerEvent<HTMLElement>, popup: EditablePopup, mode: 'move' | ResizeHandle) => {
      if (event.button !== 0) return
      onSelect(popup.key)
      const root = event.currentTarget.closest<HTMLElement>('[data-popup]')
      const measured = root && measure(root, popup.size)
      if (!root || !measured) return
      // No text selection or image ghost while dragging; keep keyboard focus on the popup.
      event.preventDefault()
      root.focus({ preventScroll: true })
      const halfWidth = measured.boxWidth / 2
      const halfHeight = measured.boxHeight / 2
      const box = { left: measured.centerX - halfWidth, right: measured.centerX + halfWidth, top: measured.centerY - halfHeight, bottom: measured.centerY + halfHeight }
      drag.current = {
        ...measured,
        ...(mode === 'move' ? { anchorX: 0, anchorY: 0, handleX: 0, handleY: 0 } : resizeAnchor(mode, box)),
        key: popup.key,
        mode: mode === 'move' ? 'move' : 'resize',
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      }
    },
    [onSelect],
  )

  const nudge = useCallback(
    (event: KeyboardEvent<HTMLElement>, popup: EditablePopup) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onSelect(popup.key)
        return
      }
      const step = event.shiftKey ? NUDGE_BIG : NUDGE
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
      const grow = event.key === '+' || event.key === '=' ? POPUP_SIZE.step : event.key === '-' || event.key === '_' ? -POPUP_SIZE.step : 0
      if (!arrows[event.key] && !grow) return
      event.preventDefault()
      const m = measure(event.currentTarget, popup.size)
      if (!m) return
      const [dx, dy] = arrows[event.key] ?? [0, 0]
      const size = grow ? clampPopupSize(popup.size + grow, m.maxSize) : popup.size
      onSelect(popup.key)
      onChange(popup.key, {
        ...placeOnStage(m, m.centerX + (dx / 100) * m.stage.width, m.centerY + (dy / 100) * m.stage.height, size),
        ...(grow && { size }),
      })
    },
    [onChange, onSelect],
  )

  return (
    <>
      {popups.map((p) => (
        // A new shown_at remounts the popup so its entrance and effect play again.
        <PopupView
          key={`${p.key}-${p.shown_at ?? 0}`}
          popup={p}
          editing={{
            selected: p.key === selectedKey,
            onPointerDown: (event, mode) => begin(event, p, mode),
            onKeyDown: (event) => nudge(event, p),
          }}
        />
      ))}
    </>
  )
}
