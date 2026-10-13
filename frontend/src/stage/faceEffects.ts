/**
 * Face-tracked camera effects, like the ones sellers know from TikTok: flower crowns,
 * puppy ears, heart eyes… Drawn on the stage over the camera, following the face's
 * position, size and head tilt. Everything is drawn in code (shapes and emoji), so there
 * is nothing to download beyond the face tracker itself.
 *
 * Keep the ids in sync with the API (App\Support\Catalog::FACE_EFFECTS).
 */
import type { FaceEffectId } from '../lib/types'

export type { FaceEffectId }

export const FACE_EFFECTS: { id: FaceEffectId; label: string; icon: string }[] = [
  { id: 'none', label: 'None', icon: '🚫' },
  { id: 'flower-crown', label: 'Flower crown', icon: '🌸' },
  { id: 'butterflies', label: 'Butterflies', icon: '🦋' },
  { id: 'puppy', label: 'Puppy', icon: '🐶' },
  { id: 'bunny', label: 'Bunny', icon: '🐰' },
  { id: 'kitty', label: 'Kitty', icon: '🐱' },
  { id: 'bear', label: 'Teddy bear', icon: '🐻' },
  { id: 'heart-eyes', label: 'Heart eyes', icon: '😍' },
  { id: 'star-eyes', label: 'Star eyes', icon: '🤩' },
  { id: 'money-eyes', label: 'Money eyes', icon: '🤑' },
  { id: 'shades', label: 'Cool shades', icon: '😎' },
  { id: 'crown', label: 'Royal crown', icon: '👑' },
  { id: 'halo', label: 'Angel halo', icon: '😇' },
  { id: 'devil', label: 'Devil horns', icon: '😈' },
  { id: 'blush', label: 'Soft blush', icon: '🌷' },
  { id: 'sparkles', label: 'Sparkles', icon: '✨' },
  { id: 'love-hearts', label: 'Love hearts', icon: '💕' },
  { id: 'crying', label: 'Crying', icon: '😭' },
  { id: 'clown', label: 'Clown', icon: '🤡' },
  { id: 'mustache', label: 'Mustache', icon: '🥸' },
  { id: 'piggy', label: 'Piggy', icon: '🐷' },
  { id: 'cowboy', label: 'Cowboy hat', icon: '🤠' },
  { id: 'party', label: 'Party hat', icon: '🥳' },
  { id: 'rainbow', label: 'Rainbow', icon: '🌈' },
]

export const isFaceEffect = (id: string): id is FaceEffectId => FACE_EFFECTS.some((e) => e.id === id)

export interface Point {
  x: number
  y: number
}

/**
 * Where the face is on the stage, in stage pixels, already mirrored like the camera.
 * "Left" and "right" are as seen on screen.
 */
export interface FacePose {
  /** Top of the forehead (hairline). */
  top: Point
  chin: Point
  eyeLeft: Point
  eyeRight: Point
  nose: Point
  mouthTop: Point
  mouthBottom: Point
  cheekLeft: Point
  cheekRight: Point
  /** Face width (ear to ear), the unit every effect is sized in. */
  width: number
  /** Head tilt in radians (0 = upright). */
  angle: number
  /** 0 = closed, about 0.15+ = wide open. */
  mouthOpen: number
}

/** MediaPipe face-mesh points used here (478-point model; 468 and 473 are the irises). */
export const LANDMARKS = {
  top: 10,
  chin: 152,
  nose: 1,
  mouthTop: 13,
  mouthBottom: 14,
  cheekA: 50,
  cheekB: 280,
  edgeA: 234,
  edgeB: 454,
  irisA: 468,
  irisB: 473,
  eyeA: [33, 133],
  eyeB: [362, 263],
} as const

/**
 * Builds the pose from landmarks already mapped to stage pixels (and mirrored).
 * Returns null when the points don't describe a usable face.
 */
export function poseFromPoints(p: (i: number) => Point | undefined): FacePose | null {
  const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  const eye = (iris: number, corners: readonly number[]) => {
    const i = p(iris)
    if (i) return i
    const [a, b] = corners.map((c) => p(c))
    return a && b ? mid(a, b) : undefined
  }
  const top = p(LANDMARKS.top)
  const chin = p(LANDMARKS.chin)
  const nose = p(LANDMARKS.nose)
  const mouthTop = p(LANDMARKS.mouthTop)
  const mouthBottom = p(LANDMARKS.mouthBottom)
  const cheekA = p(LANDMARKS.cheekA)
  const cheekB = p(LANDMARKS.cheekB)
  const edgeA = p(LANDMARKS.edgeA)
  const edgeB = p(LANDMARKS.edgeB)
  const eyeA = eye(LANDMARKS.irisA, LANDMARKS.eyeA)
  const eyeB = eye(LANDMARKS.irisB, LANDMARKS.eyeB)
  if (!top || !chin || !nose || !mouthTop || !mouthBottom || !cheekA || !cheekB || !edgeA || !edgeB || !eyeA || !eyeB) return null

  const width = Math.hypot(edgeB.x - edgeA.x, edgeB.y - edgeA.y)
  const height = Math.hypot(chin.x - top.x, chin.y - top.y)
  if (width < 8 || height < 8) return null
  const [eyeLeft, eyeRight] = eyeA.x <= eyeB.x ? [eyeA, eyeB] : [eyeB, eyeA]
  const [cheekLeft, cheekRight] = cheekA.x <= cheekB.x ? [cheekA, cheekB] : [cheekB, cheekA]

  return {
    top,
    chin,
    eyeLeft,
    eyeRight,
    nose,
    mouthTop,
    mouthBottom,
    cheekLeft,
    cheekRight,
    width,
    angle: Math.atan2(eyeRight.y - eyeLeft.y, eyeRight.x - eyeLeft.x),
    mouthOpen: Math.hypot(mouthBottom.x - mouthTop.x, mouthBottom.y - mouthTop.y) / height,
  }
}

/** Eases a new pose towards the last one, so stickers don't jitter with the tracker. */
export function smoothPose(previous: FacePose | null, next: FacePose, amount = 0.55): FacePose {
  if (!previous) return next
  const k = 1 - amount
  const pt = (a: Point, b: Point): Point => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k })
  // A big jump (another face, a cut) shouldn't glide across the screen.
  if (Math.hypot(next.nose.x - previous.nose.x, next.nose.y - previous.nose.y) > next.width * 0.8) return next
  let turn = next.angle - previous.angle
  if (turn > Math.PI) turn -= Math.PI * 2
  if (turn < -Math.PI) turn += Math.PI * 2
  return {
    top: pt(previous.top, next.top),
    chin: pt(previous.chin, next.chin),
    eyeLeft: pt(previous.eyeLeft, next.eyeLeft),
    eyeRight: pt(previous.eyeRight, next.eyeRight),
    nose: pt(previous.nose, next.nose),
    mouthTop: pt(previous.mouthTop, next.mouthTop),
    mouthBottom: pt(previous.mouthBottom, next.mouthBottom),
    cheekLeft: pt(previous.cheekLeft, next.cheekLeft),
    cheekRight: pt(previous.cheekRight, next.cheekRight),
    width: previous.width + (next.width - previous.width) * k,
    angle: previous.angle + turn * k,
    mouthOpen: previous.mouthOpen + (next.mouthOpen - previous.mouthOpen) * k,
  }
}

// ---- drawing ---------------------------------------------------------------

type Ctx = CanvasRenderingContext2D

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif'

/** Draws `paint` in a frame centred on `at`, turned with the head, measured in face widths. */
function local(ctx: Ctx, at: Point, face: FacePose, paint: (u: number) => void): void {
  ctx.save()
  ctx.translate(at.x, at.y)
  ctx.rotate(face.angle)
  paint(face.width)
  ctx.restore()
}

function emoji(ctx: Ctx, char: string, x: number, y: number, size: number, turn = 0, alpha = 1): void {
  ctx.save()
  ctx.translate(x, y)
  if (turn) ctx.rotate(turn)
  ctx.globalAlpha = alpha
  ctx.font = `${Math.max(4, Math.round(size))}px ${EMOJI_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(char, 0, 0)
  ctx.restore()
}

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient, turn = 0): void {
  ctx.beginPath()
  ctx.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), turn, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
}

function midpoint(a: Point, b: Point, t = 0.5): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/** Animal ears on top of the head, mirrored left and right. */
function ears(ctx: Ctx, face: FacePose, paint: (u: number, side: -1 | 1) => void): void {
  local(ctx, face.top, face, (u) => {
    for (const side of [-1, 1] as const) {
      ctx.save()
      paint(u, side)
      ctx.restore()
    }
  })
}

function animalNose(ctx: Ctx, face: FacePose, color: string, rx: number, ry: number): void {
  local(ctx, face.nose, face, (u) => {
    ellipse(ctx, 0, 0, u * rx, u * ry, color)
    ellipse(ctx, -u * rx * 0.3, -u * ry * 0.35, u * rx * 0.28, u * ry * 0.22, 'rgba(255,255,255,0.45)')
  })
}

function overEyes(face: FacePose, paint: (eye: Point, u: number, index: number) => void): void {
  ;[face.eyeLeft, face.eyeRight].forEach((eye, i) => paint(eye, face.width, i))
}

const EFFECTS: Record<Exclude<FaceEffectId, 'none'>, (ctx: Ctx, face: FacePose, t: number) => void> = {
  'flower-crown': (ctx, face, t) =>
    local(ctx, face.top, face, (u) => {
      const flowers = ['🌸', '🌼', '🌺', '🌷', '🌸', '🌺', '🌷', '🌼', '🌸']
      flowers.forEach((f, i) => {
        const s = i / (flowers.length - 1) - 0.5 // −0.5 … 0.5 across the head
        const x = s * u * 1.05
        const y = -u * 0.1 + s * s * u * 0.55
        const size = u * (0.24 - Math.abs(s) * 0.08)
        emoji(ctx, f, x, y, size, Math.sin(t * 1.8 + i) * 0.12 + s * 0.8)
      })
    }),

  butterflies: (ctx, face, t) =>
    local(ctx, midpoint(face.top, face.nose, 0.2), face, (u) => {
      for (let i = 0; i < 3; i++) {
        const a = t * 0.7 + (i * Math.PI * 2) / 3
        const x = Math.cos(a) * u * 0.78
        const y = Math.sin(a) * u * 0.45 - u * 0.2
        ctx.save()
        ctx.translate(x, y)
        ctx.scale(0.55 + 0.45 * Math.abs(Math.sin(t * 9 + i * 2)), 1) // flapping
        emoji(ctx, '🦋', 0, 0, u * 0.22, Math.sin(a) * 0.3)
        ctx.restore()
      }
    }),

  puppy: (ctx, face) => {
    // Floppy ears hang from the top of the head, down and outwards.
    ears(ctx, face, (u, side) => {
      ctx.translate(side * u * 0.36, u * 0.02)
      ctx.rotate(side * -0.45)
      ellipse(ctx, 0, u * 0.24, u * 0.15, u * 0.3, '#7b4a24')
      ellipse(ctx, 0, u * 0.27, u * 0.09, u * 0.22, '#b47a4c')
    })
    if (face.mouthOpen > 0.05) {
      // The tongue comes out when the seller opens their mouth.
      const open = Math.min(1, (face.mouthOpen - 0.05) / 0.12)
      local(ctx, face.mouthBottom, face, (u) => {
        ellipse(ctx, 0, u * 0.06 * open, u * 0.085, u * (0.06 + 0.1 * open), '#ff6f91')
        ctx.fillStyle = '#e04f73'
        ctx.fillRect(-u * 0.004, 0, u * 0.008, u * 0.12 * open)
      })
    }
    animalNose(ctx, face, '#2b1b12', 0.11, 0.075)
  },

  bunny: (ctx, face, t) => {
    ears(ctx, face, (u, side) => {
      ctx.translate(side * u * 0.2, -u * 0.42)
      ctx.rotate(side * 0.14 + Math.sin(t * 2.2 + side) * 0.05)
      ellipse(ctx, 0, 0, u * 0.11, u * 0.4, '#fdfdfd')
      ellipse(ctx, 0, u * 0.03, u * 0.055, u * 0.3, '#f7a6c4')
    })
    animalNose(ctx, face, '#f48fb1', 0.06, 0.045)
  },

  kitty: (ctx, face) => {
    ears(ctx, face, (u, side) => {
      ctx.translate(side * u * 0.33, -u * 0.08)
      ctx.rotate(side * 0.3)
      const tri = (size: number, color: string) => {
        ctx.beginPath()
        ctx.moveTo(-u * size, u * size * 0.3)
        ctx.lineTo(0, -u * size * 1.35)
        ctx.lineTo(u * size, u * size * 0.3)
        ctx.closePath()
        ctx.fillStyle = color
        ctx.fill()
      }
      tri(0.17, '#3d3d3d')
      tri(0.09, '#f6a5c0')
    })
    local(ctx, face.nose, face, (u) => {
      ctx.beginPath()
      ctx.moveTo(-u * 0.05, -u * 0.02)
      ctx.lineTo(u * 0.05, -u * 0.02)
      ctx.lineTo(0, u * 0.035)
      ctx.closePath()
      ctx.fillStyle = '#f48fb1'
      ctx.fill()
      ctx.strokeStyle = 'rgba(30,30,30,0.85)'
      ctx.lineWidth = Math.max(1, u * 0.008)
      ctx.lineCap = 'round'
      for (const side of [-1, 1]) {
        for (const tilt of [-0.12, 0, 0.12]) {
          ctx.beginPath()
          ctx.moveTo(side * u * 0.1, u * 0.04)
          ctx.lineTo(side * u * 0.42, u * (0.04 + tilt))
          ctx.stroke()
        }
      }
    })
  },

  bear: (ctx, face) => {
    ears(ctx, face, (u, side) => {
      ctx.translate(side * u * 0.4, -u * 0.04)
      ellipse(ctx, 0, 0, u * 0.15, u * 0.15, '#6d4223')
      ellipse(ctx, 0, 0, u * 0.08, u * 0.08, '#c48a5a')
    })
    local(ctx, face.nose, face, (u) => ellipse(ctx, 0, u * 0.03, u * 0.16, u * 0.11, 'rgba(196,138,90,0.85)'))
    animalNose(ctx, face, '#2b1b12', 0.075, 0.05)
  },

  'heart-eyes': (ctx, face, t) => overEyes(face, (eye, u, i) => emoji(ctx, '💖', eye.x, eye.y, u * 0.3 * (1 + 0.08 * Math.sin(t * 7 + i)), face.angle)),

  'star-eyes': (ctx, face, t) => overEyes(face, (eye, u, i) => emoji(ctx, '⭐', eye.x, eye.y, u * 0.28, face.angle + Math.sin(t * 2 + i) * 0.25)),

  'money-eyes': (ctx, face, t) => {
    overEyes(face, (eye, u) => emoji(ctx, '💲', eye.x, eye.y, u * 0.26, face.angle))
    local(ctx, face.top, face, (u) => {
      for (let i = 0; i < 4; i++) {
        const cycle = (t * 0.35 + i / 4) % 1
        const side = i % 2 === 0 ? -1 : 1
        emoji(ctx, '💸', side * u * (0.7 + 0.1 * (i % 3)), u * (0.9 - cycle * 1.2), u * 0.16, side * 0.2, 1 - cycle)
      }
    })
  },

  shades: (ctx, face) =>
    local(ctx, midpoint(face.eyeLeft, face.eyeRight), face, (u) => {
      const half = Math.hypot(face.eyeRight.x - face.eyeLeft.x, face.eyeRight.y - face.eyeLeft.y) / 2
      const lensW = u * 0.3
      const lensH = u * 0.19
      ctx.lineWidth = Math.max(1.5, u * 0.022)
      ctx.strokeStyle = '#111'
      for (const side of [-1, 1]) {
        const x = side * half - lensW / 2
        const glass = ctx.createLinearGradient(0, -lensH / 2, 0, lensH / 2)
        glass.addColorStop(0, 'rgba(25,25,30,0.95)')
        glass.addColorStop(1, 'rgba(70,70,85,0.92)')
        ctx.beginPath()
        ctx.roundRect(x, -lensH / 2, lensW, lensH, lensH * 0.35)
        ctx.fillStyle = glass
        ctx.fill()
        ctx.stroke()
        // A glint on each lens.
        ctx.fillStyle = 'rgba(255,255,255,0.35)'
        ctx.beginPath()
        ctx.roundRect(x + lensW * 0.15, -lensH * 0.3, lensW * 0.35, lensH * 0.12, lensH * 0.06)
        ctx.fill()
        // Arms towards the ears.
        ctx.beginPath()
        ctx.moveTo(side * (half + lensW / 2), -lensH * 0.3)
        ctx.lineTo(side * u * 0.5, -lensH * 0.35)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.moveTo(-half + lensW / 2, -lensH * 0.25)
      ctx.quadraticCurveTo(0, -lensH * 0.5, half - lensW / 2, -lensH * 0.25)
      ctx.stroke()
    }),

  crown: (ctx, face, t) => local(ctx, face.top, face, (u) => emoji(ctx, '👑', 0, -u * 0.2 + Math.sin(t * 2) * u * 0.01, u * 0.58)),

  halo: (ctx, face, t) =>
    local(ctx, face.top, face, (u) => {
      ctx.save()
      ctx.shadowColor = 'rgba(255,214,90,0.9)'
      ctx.shadowBlur = u * 0.12
      ctx.strokeStyle = '#ffd54a'
      ctx.lineWidth = Math.max(2, u * 0.045)
      ctx.beginPath()
      ctx.ellipse(0, -u * 0.38 + Math.sin(t * 2) * u * 0.02, u * 0.36, u * 0.08, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }),

  devil: (ctx, face) =>
    ears(ctx, face, (u, side) => {
      ctx.translate(side * u * 0.28, -u * 0.04)
      const horn = ctx.createLinearGradient(0, 0, 0, -u * 0.32)
      horn.addColorStop(0, '#8b0000')
      horn.addColorStop(1, '#ff3b30')
      ctx.beginPath()
      ctx.moveTo(-u * 0.08, 0)
      ctx.quadraticCurveTo(side * u * 0.02, -u * 0.2, side * u * 0.12, -u * 0.34)
      ctx.quadraticCurveTo(side * u * 0.06, -u * 0.12, u * 0.08, 0)
      ctx.closePath()
      ctx.fillStyle = horn
      ctx.fill()
    }),

  blush: (ctx, face) => {
    for (const cheek of [face.cheekLeft, face.cheekRight]) {
      const r = face.width * 0.17
      const glow = ctx.createRadialGradient(cheek.x, cheek.y, 0, cheek.x, cheek.y, r)
      glow.addColorStop(0, 'rgba(255,105,140,0.45)')
      glow.addColorStop(1, 'rgba(255,105,140,0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(cheek.x, cheek.y, r, 0, Math.PI * 2)
      ctx.fill()
    }
    // A few freckles across the nose and cheeks.
    local(ctx, midpoint(face.eyeLeft, face.eyeRight, 0.5), face, (u) => {
      const spots: [number, number][] = [
        [-0.2, 0.2], [-0.15, 0.26], [-0.24, 0.27], [-0.1, 0.22], [0.2, 0.2], [0.15, 0.26], [0.24, 0.27], [0.1, 0.22], [-0.04, 0.18], [0.04, 0.19],
      ]
      for (const [x, y] of spots) ellipse(ctx, x * u, y * u, u * 0.008, u * 0.008, 'rgba(120,70,40,0.55)')
    })
  },

  sparkles: (ctx, face, t) =>
    local(ctx, midpoint(face.top, face.chin, 0.4), face, (u) => {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + 0.4
        const twinkle = 0.5 + 0.5 * Math.sin(t * 4 + i * 1.7)
        emoji(ctx, '✨', Math.cos(a) * u * 0.72, Math.sin(a) * u * 0.85, u * (0.1 + 0.08 * twinkle), 0, 0.35 + 0.65 * twinkle)
      }
    }),

  'love-hearts': (ctx, face, t) =>
    local(ctx, face.chin, face, (u) => {
      const hearts = ['💕', '💗', '💖', '💓', '💞', '💗']
      hearts.forEach((h, i) => {
        const cycle = (t * 0.3 + i / hearts.length) % 1
        const side = i % 2 === 0 ? -1 : 1
        const x = side * u * (0.55 + 0.15 * Math.sin(i * 3)) + Math.sin(t * 2 + i) * u * 0.05
        emoji(ctx, h, x, -cycle * u * 1.9, u * 0.15, 0, cycle < 0.85 ? 1 : (1 - cycle) / 0.15)
      })
    }),

  crying: (ctx, face, t) =>
    overEyes(face, (eye, u, i) =>
      local(ctx, eye, face, () => {
        const length = u * 0.8
        const stream = ctx.createLinearGradient(0, 0, 0, length)
        stream.addColorStop(0, 'rgba(70,170,255,0.95)')
        stream.addColorStop(1, 'rgba(70,170,255,0.1)')
        ctx.fillStyle = stream
        ctx.beginPath()
        ctx.roundRect(-u * 0.04, u * 0.04, u * 0.08, length, u * 0.04)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.55)'
        ctx.fillRect(-u * 0.022, u * 0.06, u * 0.012, length * 0.85)
        for (let d = 0; d < 2; d++) {
          const y = u * 0.08 + ((t * 0.8 + d / 2 + i * 0.3) % 1) * length
          ellipse(ctx, 0, y, u * 0.045, u * 0.065, 'rgba(120,200,255,0.95)')
        }
      }),
    ),

  clown: (ctx, face) => {
    for (const cheek of [face.cheekLeft, face.cheekRight]) ellipse(ctx, cheek.x, cheek.y, face.width * 0.09, face.width * 0.09, 'rgba(255,45,45,0.35)')
    local(ctx, face.nose, face, (u) => {
      const ball = ctx.createRadialGradient(-u * 0.03, -u * 0.03, u * 0.01, 0, 0, u * 0.1)
      ball.addColorStop(0, '#ff8a80')
      ball.addColorStop(1, '#d50000')
      ellipse(ctx, 0, 0, u * 0.1, u * 0.1, ball)
    })
  },

  mustache: (ctx, face) =>
    local(ctx, midpoint(face.nose, face.mouthTop, 0.6), face, (u) => {
      ctx.fillStyle = '#3b2a1e'
      for (const side of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(0, -u * 0.02)
        ctx.bezierCurveTo(side * u * 0.12, -u * 0.08, side * u * 0.22, u * 0.02, side * u * 0.3, -u * 0.06)
        ctx.bezierCurveTo(side * u * 0.26, u * 0.06, side * u * 0.12, u * 0.06, 0, u * 0.03)
        ctx.closePath()
        ctx.fill()
      }
    }),

  piggy: (ctx, face) => {
    ears(ctx, face, (u, side) => {
      ctx.translate(side * u * 0.35, -u * 0.02)
      ctx.rotate(side * 0.5)
      ctx.beginPath()
      ctx.moveTo(-u * 0.1, u * 0.04)
      ctx.lineTo(0, -u * 0.16)
      ctx.lineTo(u * 0.1, u * 0.04)
      ctx.closePath()
      ctx.fillStyle = '#f7a1b5'
      ctx.fill()
    })
    local(ctx, face.nose, face, (u) => {
      ellipse(ctx, 0, 0, u * 0.13, u * 0.09, '#f7a1b5')
      ctx.strokeStyle = '#e57c98'
      ctx.lineWidth = Math.max(1, u * 0.012)
      ctx.stroke()
      ellipse(ctx, -u * 0.045, 0, u * 0.022, u * 0.035, '#b84d68')
      ellipse(ctx, u * 0.045, 0, u * 0.022, u * 0.035, '#b84d68')
    })
  },

  cowboy: (ctx, face) =>
    local(ctx, face.top, face, (u) => {
      ctx.fillStyle = '#8b5a2b'
      ctx.beginPath()
      ctx.roundRect(-u * 0.32, -u * 0.48, u * 0.64, u * 0.42, [u * 0.2, u * 0.2, u * 0.04, u * 0.04])
      ctx.fill()
      ctx.fillStyle = '#3b2412'
      ctx.fillRect(-u * 0.32, -u * 0.14, u * 0.64, u * 0.07)
      ellipse(ctx, 0, -u * 0.04, u * 0.78, u * 0.1, '#7a4a20')
    }),

  party: (ctx, face, t) =>
    local(ctx, face.top, face, (u) => {
      ctx.save()
      ctx.rotate(0.18)
      ctx.beginPath()
      ctx.moveTo(-u * 0.2, -u * 0.04)
      ctx.lineTo(u * 0.2, -u * 0.04)
      ctx.lineTo(0, -u * 0.62)
      ctx.closePath()
      ctx.save()
      ctx.clip()
      const stripes = ['#ff4d8d', '#ffd23f', '#3ec1ff', '#7c5cff']
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = stripes[i % stripes.length]
        ctx.fillRect(-u * 0.25, -u * 0.62 + i * u * 0.08, u * 0.5, u * 0.08)
      }
      ctx.restore()
      ellipse(ctx, 0, -u * 0.64, u * 0.06, u * 0.06, '#ffffff')
      ctx.restore()
      const colors = ['#ff4d8d', '#ffd23f', '#3ec1ff', '#7cff6b']
      for (let i = 0; i < 10; i++) {
        const cycle = (t * 0.4 + i / 10) % 1
        const x = (((i * 37) % 100) / 100 - 0.5) * u * 1.6
        ctx.fillStyle = colors[i % colors.length]
        ctx.save()
        ctx.translate(x, -u * 0.7 + cycle * u * 1.4)
        ctx.rotate(t * 3 + i)
        ctx.globalAlpha = 1 - cycle
        ctx.fillRect(-u * 0.015, -u * 0.006, u * 0.03, u * 0.012)
        ctx.restore()
      }
    }),

  rainbow: (ctx, face) =>
    local(ctx, face.top, face, (u) => {
      // Drawn rather than an emoji: the 🌈 glyph is lopsided on some systems.
      const bands = ['#ff4d4d', '#ff9f1a', '#ffe14d', '#4cd964', '#3ec1ff', '#7c5cff']
      const band = u * 0.045
      ctx.lineWidth = band + 1
      bands.forEach((color, i) => {
        ctx.strokeStyle = color
        ctx.beginPath()
        ctx.arc(0, -u * 0.05, u * 0.62 - i * band, Math.PI, 0)
        ctx.stroke()
      })
      emoji(ctx, '☁️', -u * 0.6, -u * 0.04, u * 0.2)
      emoji(ctx, '☁️', u * 0.6, -u * 0.04, u * 0.2)
    }),
}

/** Draws one effect for one face. `seconds` drives the small animations. */
export function drawFaceEffect(ctx: Ctx, effect: FaceEffectId, face: FacePose, seconds: number): void {
  if (effect === 'none') return
  ctx.save()
  ctx.filter = 'none'
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  EFFECTS[effect](ctx, face, seconds)
  ctx.restore()
}
