import { memo, useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'
import type { Orientation, ForegroundSettings, PopupLook } from '../lib/types'
import { DISPLAY_FONT, SAFE_ZONES } from './catalog'
import { Effects } from './Effects'
import { nearTop, resolveLook } from './look'

/**
 * The shared stage drawing used by the editor preview, dashboard thumbnails and the clean
 * screen. It keeps the 16:9 or 9:16 shape and exposes one size unit (--u = 1% of the
 * shorter side) so popups and effects scale identically everywhere.
 */
export function StageFrame({
  orientation,
  children,
  className,
  style,
  fill = false,
  frameRef,
}: {
  orientation: Orientation
  children: ReactNode
  className?: string
  style?: CSSProperties
  /** Fill the parent, letterboxed (clean screen), instead of sizing by width. */
  fill?: boolean
  /** Receives the stage element (the clean screen crops streaming to it). */
  frameRef?: RefObject<HTMLDivElement | null>
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const setRef = useCallback(
    (element: HTMLDivElement | null) => {
      ref.current = element
      if (frameRef) frameRef.current = element
    },
    [frameRef],
  )
  const [unit, setUnit] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setUnit(Math.min(el.clientWidth, el.clientHeight) / 100)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const ratio = orientation === 'portrait' ? '9 / 16' : '16 / 9'
  const sizing: CSSProperties = fill
    ? orientation === 'portrait'
      ? { height: '100%', maxWidth: '100%', aspectRatio: ratio }
      : { width: '100%', maxHeight: '100%', aspectRatio: ratio }
    : { width: '100%', aspectRatio: ratio }

  return (
    <div
      ref={setRef}
      className={className}
      style={{ position: 'relative', overflow: 'hidden', ...sizing, ['--u' as string]: `${unit}px`, ...style }}
    >
      {unit > 0 && children}
    </div>
  )
}

/** A resize handle: a corner, or the middle of an edge (n = top, e = right, s = bottom, w = left). */
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

const CORNER = 16
const EDGE_LONG = 22
const EDGE_SHORT = 10
// Corners are squares on the box's corners; edges are short bars centred on each side.
const HANDLES: { id: ResizeHandle; style: CSSProperties; cursor: string }[] = [
  { id: 'nw', style: { left: -CORNER / 2, top: -CORNER / 2, width: CORNER, height: CORNER }, cursor: 'nwse-resize' },
  { id: 'ne', style: { right: -CORNER / 2, top: -CORNER / 2, width: CORNER, height: CORNER }, cursor: 'nesw-resize' },
  { id: 'sw', style: { left: -CORNER / 2, bottom: -CORNER / 2, width: CORNER, height: CORNER }, cursor: 'nesw-resize' },
  { id: 'se', style: { right: -CORNER / 2, bottom: -CORNER / 2, width: CORNER, height: CORNER }, cursor: 'nwse-resize' },
  { id: 'n', style: { left: '50%', top: -EDGE_SHORT / 2, width: EDGE_LONG, height: EDGE_SHORT, marginLeft: -EDGE_LONG / 2 }, cursor: 'ns-resize' },
  { id: 's', style: { left: '50%', bottom: -EDGE_SHORT / 2, width: EDGE_LONG, height: EDGE_SHORT, marginLeft: -EDGE_LONG / 2 }, cursor: 'ns-resize' },
  { id: 'w', style: { top: '50%', left: -EDGE_SHORT / 2, width: EDGE_SHORT, height: EDGE_LONG, marginTop: -EDGE_LONG / 2 }, cursor: 'ew-resize' },
  { id: 'e', style: { top: '50%', right: -EDGE_SHORT / 2, width: EDGE_SHORT, height: EDGE_LONG, marginTop: -EDGE_LONG / 2 }, cursor: 'ew-resize' },
]

/** Editor-only: lets the seller drag a popup on the preview and resize it from its corners and edges. */
export interface PopupEditing {
  selected: boolean
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, mode: 'move' | ResizeHandle) => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void
}

/** One popup at its spot, with its entrance animation and effect. */
export const PopupView = memo(function PopupView({
  popup,
  animate = true,
  editing,
}: {
  popup: PopupLook
  /** Off for thumbnails: no entrance and no effects. */
  animate?: boolean
  editing?: PopupEditing
}) {
  const look = resolveLook(popup)
  const fontSize = `calc(var(--u) * ${look.fontU})`
  const circle = look.shape === 'circle'
  const entrance = animate && popup.entrance !== 'none' ? `a-${popup.entrance}` : undefined
  const editProps = editing
    ? {
        'data-popup': popup.key,
        role: 'button',
        tabIndex: 0,
        'aria-label': `${look.text}: drag to move, drag a corner or edge to resize. Arrow keys move it, plus and minus resize it.`,
        'aria-pressed': editing.selected,
        onPointerDown: (e: ReactPointerEvent<HTMLElement>) => editing.onPointerDown(e, 'move'),
        onKeyDown: editing.onKeyDown,
      }
    : {}

  return (
    <div
      {...editProps}
      style={{
        position: 'absolute',
        top: look.top,
        left: look.left,
        transform: `translate(${look.tx}, ${look.ty})`,
        // Its own width wherever it sits: otherwise the browser only allows the room between its
        // left edge and the stage's right edge, and squeezes pictures placed near an edge.
        width: 'max-content',
        zIndex: editing?.selected ? 3 : 2,
        ...(editing && { cursor: 'move', touchAction: 'none', userSelect: 'none', outline: 'none' }),
      }}
    >
      {animate && <Effects effect={popup.effect} loop={popup.effect_repeat === 'loop'} fontSize={fontSize} topRow={nearTop(popup)} />}
      {editing?.selected && (
        <>
          <div aria-hidden="true" style={{ position: 'absolute', inset: -4, border: '2px dashed #FF6B57', borderRadius: 6, pointerEvents: 'none', zIndex: 2 }} />
          {HANDLES.map((h) => (
            <span
              key={h.id}
              aria-hidden="true"
              onPointerDown={(e) => {
                e.stopPropagation()
                editing.onPointerDown(e, h.id)
              }}
              style={{ position: 'absolute', borderRadius: 4, background: '#FFFFFF', border: '2px solid #FF6B57', boxSizing: 'border-box', cursor: h.cursor, zIndex: 3, touchAction: 'none', ...h.style }}
            />
          ))}
        </>
      )}
      <div className={entrance} style={{ position: 'relative', zIndex: 1 }}>
        {look.kind === 'image' ? (
          look.imageUrl ? (
            // maxWidth none: the base styles cap images at their box's width, which squeezed them.
            <img src={look.imageUrl} alt={look.text} draggable={false} style={{ display: 'block', height: `calc(var(--u) * ${look.imageU})`, width: 'auto', maxWidth: 'none' }} />
          ) : null
        ) : (
          <div
            style={{
              fontSize,
              backgroundColor: look.bg,
              color: look.fg,
              border: look.border,
              borderRadius: look.shape === 'tag' ? '0.28em' : '999px',
              padding: circle ? 0 : '0.42em 0.8em',
              width: circle ? '3.2em' : 'auto',
              height: circle ? '3.2em' : 'auto',
              transform: `rotate(${look.rot})`,
              display: 'grid',
              placeItems: 'center',
              boxSizing: 'border-box',
              fontFamily: DISPLAY_FONT,
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: '-0.01em',
              whiteSpace: 'nowrap',
              boxShadow: '0 0.18em 0 rgba(0,0,0,0.35)',
            }}
          >
            {look.text}
          </div>
        )}
      </div>
    </div>
  )
})

/** Popups in the order they were shown (last shown on top). */
export function PopupLayer({ popups, animate = true }: { popups: (PopupLook & { shown_at?: number })[]; animate?: boolean }) {
  return (
    <>
      {popups.map((p) => (
        // A new shown_at remounts the popup so its entrance and effect play again.
        <PopupView key={`${p.key}-${p.shown_at ?? 0}`} popup={p} animate={animate} />
      ))}
    </>
  )
}

/**
 * The foreground image across the full width of the stage, docked to the top or bottom, at its
 * own aspect ratio. It sits above the camera and below popups.
 */
export function ForegroundLayer({ foreground }: { foreground: ForegroundSettings & { media_url?: string | null } }) {
  if (!foreground.enabled || !foreground.media_url) return null
  return (
    <img
      src={foreground.media_url}
      alt=""
      draggable={false}
      style={{ position: 'absolute', left: 0, [foreground.dock]: 0, display: 'block', width: '100%', height: 'auto', zIndex: 1, pointerEvents: 'none' }}
    />
  )
}

/** Approximate areas TikTok / Facebook cover with their own buttons. Seller-only. */
export function SafeZones({ orientation }: { orientation: Orientation }) {
  return (
    <>
      {SAFE_ZONES[orientation].map((z) => (
        <div
          key={z.label}
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: z.top,
            left: z.left,
            width: z.w,
            height: z.h,
            zIndex: 3,
            boxSizing: 'border-box',
            border: '1px dashed #8AB4FF',
            backgroundColor: 'rgba(138,180,255,0.16)',
            pointerEvents: 'none',
            padding: 4,
          }}
        >
          <span style={{ padding: '1px 6px', borderRadius: 4, backgroundColor: 'rgba(13,12,16,0.85)', color: '#B5CEFF', fontSize: 11, fontWeight: 600 }}>
            {z.label}
          </span>
        </div>
      ))}
    </>
  )
}
