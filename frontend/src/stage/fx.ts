import type { EffectId } from '../lib/types'

// Particle layouts for each effect, in em relative to the popup's centre so effects
// scale with the popup. Pseudo-random but stable, so re-renders never make them jump.

export interface FxPart {
  x: string
  y: string
  rot: string
  color: string
  delay: string
  kind: string
  size: string
  width: string
  duration: string
}

const COLORS = ['#F5C542', '#FF5A36', '#8AB4FF', '#C6F36B', '#F2A3B8', '#F4F1EA']

/** Deterministic 0..1 noise. */
export function rnd(i: number, seed: number): number {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453
  return x - Math.floor(x)
}

const em = (n: number) => `${n.toFixed(2)}em`
const sec = (n: number) => `${n.toFixed(2)}s`

const part = (p: Partial<FxPart>): FxPart => ({
  x: '0em',
  y: '0em',
  rot: '0deg',
  color: COLORS[0],
  delay: '0s',
  kind: '',
  size: '1em',
  width: '0.3em',
  duration: '',
  ...p,
})

export function fxParts(effect: EffectId): FxPart[] {
  const parts: FxPart[] = []
  switch (effect) {
    case 'fireworks':
      ;[
        { x: -3.2, y: -1.6, d: 0 },
        { x: 3.4, y: -2.2, d: 0.45 },
        { x: 0.2, y: -3.4, d: 0.9 },
      ].forEach((b, bi) => {
        for (let i = 0; i < 12; i++) {
          parts.push(
            part({
              x: em(b.x),
              y: em(b.y),
              rot: `${i * 30 + bi * 10}deg`,
              color: COLORS[(i + bi * 2) % COLORS.length],
              delay: sec(b.d),
              kind: i % 2 ? 'fx-fwb' : 'fx-fwa',
            }),
          )
        }
      })
      break
    case 'confetti':
      for (let i = 0; i < 26; i++) {
        parts.push(
          part({
            x: em(-6 + 12 * rnd(i, 1)),
            color: COLORS[i % COLORS.length],
            delay: sec(rnd(i, 2) * 1.2),
            duration: sec(1.6 + rnd(i, 3) * 0.9),
            width: i % 3 ? '0.3em' : '0.45em',
            kind: i % 2 ? 'fx-cfb' : 'fx-cfa',
          }),
        )
      }
      break
    case 'flags':
      for (let i = 0; i < 9; i++) {
        parts.push(part({ color: COLORS[i % COLORS.length], delay: sec(-i * 0.16) }))
      }
      break
    case 'applause':
      for (let i = 0; i < 8; i++) {
        parts.push(
          part({
            x: em(-4 + i * (8 / 7)),
            y: em(0.8 + rnd(i, 4) * 0.6),
            rot: `${((i % 2 ? 1 : -1) * (10 + rnd(i, 5) * 15)).toFixed(0)}deg`,
            color: COLORS[i % COLORS.length],
            delay: sec(i * 0.18),
          }),
        )
      }
      break
    case 'sparkle':
      for (let i = 0; i < 10; i++) {
        const angle = (i * 36 * Math.PI) / 180
        const r = 1.6 + rnd(i, 6) * 0.9
        parts.push(
          part({
            x: em(Math.cos(angle) * r * 2.2),
            y: em(Math.sin(angle) * r),
            size: em(0.5 + rnd(i, 7) * 0.45),
            color: i % 3 ? '#F5C542' : '#F4F1EA',
            delay: sec(rnd(i, 8) * 1.2),
          }),
        )
      }
      break
    case 'hearts':
      for (let i = 0; i < 9; i++) {
        parts.push(
          part({
            x: em(-3 + rnd(i, 9) * 6),
            y: em(0.6),
            size: em(0.7 + rnd(i, 10) * 0.4),
            color: ['#FF5A36', '#F2A3B8', '#FF8FA3'][i % 3],
            delay: sec(i * 0.2),
          }),
        )
      }
      break
    default:
      break
  }
  return parts
}
