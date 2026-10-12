import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Button, cx } from '../components/ui'
import type { TourStep } from './tours'

/** Space around the highlighted element, the gap to the card, and the card's room on screen. */
const PAD = 8
const GAP = 12
const MARGIN = 16
const CARD_WIDTH = 360
const CARD_ROOM = 240

type Layout = { rect: DOMRect | null; vw: number; vh: number }

/** The first visible element for a step (hidden copies, e.g. on another breakpoint, are skipped). */
function findTarget(target: string | undefined): HTMLElement | null {
  if (!target) return null
  const all = document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)
  return Array.from(all).find((el) => el.getClientRects().length > 0) ?? null
}

/** Below the element if it fits, else above, else (the element fills the screen) at the bottom. */
function cardPosition({ rect, vw, vh }: Layout): CSSProperties {
  const width = Math.min(CARD_WIDTH, vw - MARGIN * 2)
  if (!rect) return { width, left: (vw - width) / 2, top: '50%', transform: 'translateY(-50%)' }
  const left = Math.min(Math.max(rect.left, MARGIN), vw - width - MARGIN)
  if (vh - rect.bottom >= CARD_ROOM) return { width, left, top: rect.bottom + PAD + GAP }
  if (rect.top >= CARD_ROOM) return { width, left, bottom: vh - rect.top + PAD + GAP }
  return { width, left: (vw - width) / 2, bottom: MARGIN }
}

/**
 * A step-by-step walkthrough: dims the page, highlights one element at a time and explains
 * it in a card. The page can't be clicked meanwhile (so nothing changes under the tour).
 * Esc skips; the arrow keys move between steps.
 *
 * With `offerDontShowAgain`, the card has a "Don't show this again" box (ticked by default);
 * closing the tour in any way reports whether it was ticked.
 */
export function Walkthrough({
  steps,
  offerDontShowAgain = false,
  onClose: close,
}: {
  steps: TourStep[]
  offerDontShowAgain?: boolean
  onClose: (dontShowAgain: boolean) => void
}) {
  const [index, setIndex] = useState(0)
  const [layout, setLayout] = useState<Layout | null>(null)
  const [dontShowAgain, setDontShowAgain] = useState(true)
  const onClose = useCallback(() => close(offerDontShowAgain && dontShowAgain), [close, offerDontShowAgain, dontShowAgain])
  const checkboxId = useId()
  const primary = useRef<HTMLButtonElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const bodyId = useId()
  const step = steps[index]
  const target = step.target
  const last = index === steps.length - 1

  // Moving keeps focus on the main button (Back disappears on the first step).
  const next = useCallback(() => {
    if (last) return onClose()
    setIndex((i) => i + 1)
    primary.current?.focus({ preventScroll: true })
  }, [last, onClose])
  const back = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1))
    primary.current?.focus({ preventScroll: true })
  }, [])

  // Bring the step's element into view and follow it while the page scrolls or resizes.
  useEffect(() => {
    const el = findTarget(target)
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' })
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setLayout({ rect: el?.getBoundingClientRect() ?? null, vw: window.innerWidth, vh: window.innerHeight }))
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [target])

  // Focus the main button when the card first shows; give focus back on close.
  const focusPrimary = useCallback((el: HTMLButtonElement | null) => {
    primary.current = el
    el?.focus({ preventScroll: true })
  }, [])
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    return () => before?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        // Keep keyboard focus on the card's controls while it's open.
        const buttons = Array.from(card.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? [])
        if (buttons.length === 0) return
        const at = buttons.indexOf(document.activeElement as HTMLElement)
        const to = e.shiftKey ? (at <= 0 ? buttons.length - 1 : at - 1) : at === buttons.length - 1 ? 0 : at + 1
        buttons[to].focus()
      } else if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') back()
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    // Capture, so the editor's own shortcuts don't also react.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [next, back, onClose])

  if (!layout) return null
  const { rect } = layout
  const shade = 'rgb(3 13 31 / 0.62)'

  return createPortal(
    <div className="fixed inset-0 z-[70]">
      {/* Catches clicks on the page while the tour is open. */}
      <div className="absolute inset-0" aria-hidden="true" />
      {rect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-[16px] ring-2 ring-white/90 transition-all duration-200 ease-out motion-reduce:transition-none"
          style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, boxShadow: `0 0 0 9999px ${shade}` }}
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0" style={{ background: shade }} />
      )}

      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="absolute flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-5 text-text shadow-[0_18px_50px_rgba(0,0,0,0.35)]"
        style={cardPosition(layout)}
      >
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {steps.map((s, i) => (
            <span key={s.title} className={cx('h-1.5 rounded-full transition-all duration-200 motion-reduce:transition-none', i === index ? 'w-5 bg-primary' : 'w-1.5 bg-line-strong')} />
          ))}
        </div>
        <span className="sr-only">
          Step {index + 1} of {steps.length}
        </span>
        <h2 id={titleId} className="m-0 font-display text-lg leading-snug font-bold tracking-[-0.01em]">
          {step.title}
        </h2>
        <p id={bodyId} className="m-0 text-sm text-text-2">
          {step.body}
        </p>
        {offerDontShowAgain && (
          <div className="flex items-center gap-2.5">
            <input
              id={checkboxId}
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="h-5 w-5 shrink-0 cursor-pointer rounded accent-primary"
            />
            <label htmlFor={checkboxId} className="cursor-pointer text-[13px] text-text-2">
              Don’t show this again
            </label>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {!last && (
            <Button size="sm" variant="ghost" onClick={onClose}>
              Skip tour
            </Button>
          )}
          <span className="flex-1" />
          {index > 0 && (
            <Button size="sm" onClick={back}>
              Back
            </Button>
          )}
          <Button ref={focusPrimary} size="sm" variant="primary" onClick={next}>
            {last ? 'Got it' : index === 0 ? 'Show me' : 'Next'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
