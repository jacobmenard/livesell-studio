import { memo, useMemo } from 'react'
import type { EffectId } from '../lib/types'
import { fxParts } from './fx'

interface EffectsProps {
  effect: EffectId
  loop: boolean
  /** Font size of the popup; every particle is sized in em of this. */
  fontSize: string
  /** Popup sits in the top row: banderitas hang below it instead of above. */
  topRow: boolean
}

/** Decorative particles around a popup. Hidden from screen readers. */
export const Effects = memo(function Effects({ effect, loop, fontSize, topRow }: EffectsProps) {
  const parts = useMemo(() => fxParts(effect), [effect])
  if (effect === 'none' || parts.length === 0) return null

  return (
    <div
      aria-hidden="true"
      className={loop ? 'fx-loop' : undefined}
      style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, fontSize, pointerEvents: 'none', zIndex: 0 }}
    >
      {effect === 'fireworks' &&
        parts.map((p, i) => (
          <div key={i} style={{ position: 'absolute', left: p.x, top: p.y, width: 0, height: 0, transform: `rotate(${p.rot})` }}>
            <span
              className={`fx ${p.kind}`}
              style={{
                position: 'absolute',
                left: '-0.1em',
                top: '-0.1em',
                width: '0.2em',
                height: '0.2em',
                borderRadius: 999,
                backgroundColor: p.color,
                boxShadow: `0 0 0.35em ${p.color}`,
                animationDelay: p.delay,
              }}
            />
          </div>
        ))}

      {effect === 'confetti' &&
        parts.map((p, i) => (
          <span
            key={i}
            className={`fx ${p.kind}`}
            style={{
              position: 'absolute',
              left: p.x,
              top: '-3.5em',
              width: p.width,
              height: '0.6em',
              borderRadius: '0.08em',
              backgroundColor: p.color,
              animationDelay: p.delay,
              animationDuration: p.duration,
            }}
          />
        ))}

      {effect === 'flags' && (
        <div className="fx-drop" style={{ position: 'absolute', left: '-5.5em', top: topRow ? '1.3em' : '-3.2em', width: '11em', display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: '0.07em', borderRadius: 999, backgroundColor: '#F4F1EA' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 0.2em' }}>
            {parts.map((p, i) => (
              <span
                key={i}
                className="fx-flag"
                style={{
                  display: 'block',
                  width: '0.95em',
                  height: '1.2em',
                  backgroundColor: p.color,
                  clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
                  transformOrigin: 'top center',
                  animationDelay: p.delay,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {effect === 'applause' &&
        parts.map((p, i) => (
          <div key={i} style={{ position: 'absolute', left: p.x, top: p.y, transform: `translate(-50%, -50%) rotate(${p.rot})` }}>
            <svg
              className="fx fx-apl"
              width="1.2em"
              height="1.2em"
              viewBox="0 0 24 24"
              fill="none"
              stroke={p.color}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ display: 'block', animationDelay: p.delay }}
            >
              <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
              <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
              <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
              <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
            </svg>
          </div>
        ))}

      {effect === 'sparkle' &&
        parts.map((p, i) => (
          <div key={i} style={{ position: 'absolute', left: p.x, top: p.y, transform: 'translate(-50%, -50%)' }}>
            <svg className="fx fx-spk" width={p.size} height={p.size} viewBox="0 0 24 24" style={{ display: 'block', animationDelay: p.delay }}>
              <path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" fill={p.color} />
            </svg>
          </div>
        ))}

      {effect === 'hearts' &&
        parts.map((p, i) => (
          <div key={i} style={{ position: 'absolute', left: p.x, top: p.y, transform: 'translate(-50%, -50%)' }}>
            <svg className="fx fx-hrt" width={p.size} height={p.size} viewBox="0 0 24 24" style={{ display: 'block', animationDelay: p.delay }}>
              <path
                d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"
                fill={p.color}
              />
            </svg>
          </div>
        ))}
    </div>
  )
})
