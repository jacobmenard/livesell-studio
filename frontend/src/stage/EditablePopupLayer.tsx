import { useCallback, useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import type { PopupLook } from '../lib/types'
import { POPUP_SIZE } from './catalog'
import { PopupView, type ResizeCorner } from './Stage'

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
  startDistance: number
  moved: boolean
}

/**
 * The editor preview's popups: drag one to move it anywhere, drag a corner to resize it
 * (evenly, around its centre) up to the full screen width, or use the arrow keys and + / −
 * once it's selected. Popups stay on screen. The clean screen and thumbnails
 * keep using the plain PopupLayer.
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
      // Grows around the centre (pinned, so a grid-spot popup becomes freely placed), up to the full screen width.
      const distance = Math.hypot(event.clientX - d.centerX, event.clientY - d.centerY)
      const size = clampPopupSize((d.size * distance) / d.startDistance, d.maxSize)
      onChangeRef.current(d.key, { size, ...placeOnStage(d, d.centerX, d.centerY, size) })
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
    (event: PointerEvent<HTMLElement>, popup: EditablePopup, mode: 'move' | ResizeCorner) => {
      if (event.button !== 0) return
      onSelect(popup.key)
      const root = event.currentTarget.closest<HTMLElement>('[data-popup]')
      const measured = root && measure(root, popup.size)
      if (!root || !measured) return
      // No text selection or image ghost while dragging; keep keyboard focus on the popup.
      event.preventDefault()
      root.focus({ preventScroll: true })
      drag.current = {
        ...measured,
        key: popup.key,
        mode: mode === 'move' ? 'move' : 'resize',
        startX: event.clientX,
        startY: event.clientY,
        startDistance: Math.max(8, Math.hypot(event.clientX - measured.centerX, event.clientY - measured.centerY)),
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
