import { describe, expect, it } from 'vitest'
import { FACE_EFFECTS, LANDMARKS, isFaceEffect, poseFromPoints, smoothPose, type Point } from './faceEffects'

/** A face 200 px wide centred at (500, 400), optionally tilted, built from the landmark indices used. */
function points(tilt = 0, mouthGap = 4): (i: number) => Point | undefined {
  const at = (x: number, y: number): Point => {
    const [c, s] = [Math.cos(tilt), Math.sin(tilt)]
    return { x: 500 + x * c - y * s, y: 400 + x * s + y * c }
  }
  const map = new Map<number, Point>([
    [LANDMARKS.top, at(0, -130)],
    [LANDMARKS.chin, at(0, 130)],
    [LANDMARKS.nose, at(0, 10)],
    [LANDMARKS.mouthTop, at(0, 60)],
    [LANDMARKS.mouthBottom, at(0, 60 + mouthGap)],
    [LANDMARKS.cheekA, at(60, 30)],
    [LANDMARKS.cheekB, at(-60, 30)],
    [LANDMARKS.edgeA, at(100, 0)],
    [LANDMARKS.edgeB, at(-100, 0)],
    [LANDMARKS.irisA, at(40, -30)],
    [LANDMARKS.irisB, at(-40, -30)],
  ])
  return (i) => map.get(i)
}

describe('face effects', () => {
  it('offers at least 20 effects plus None, each with a label and icon', () => {
    expect(FACE_EFFECTS[0].id).toBe('none')
    expect(FACE_EFFECTS.length).toBeGreaterThanOrEqual(21)
    expect(new Set(FACE_EFFECTS.map((e) => e.id)).size).toBe(FACE_EFFECTS.length)
    expect(FACE_EFFECTS.every((e) => e.label && e.icon)).toBe(true)
    expect(isFaceEffect('flower-crown')).toBe(true)
    expect(isFaceEffect('laser-eyes')).toBe(false)
  })

  it('reads size, tilt, and on-screen left and right from the landmarks', () => {
    const pose = poseFromPoints(points())!
    expect(pose.width).toBeCloseTo(200)
    expect(pose.angle).toBeCloseTo(0)
    expect(pose.eyeLeft.x).toBeLessThan(pose.eyeRight.x)
    expect(pose.cheekLeft.x).toBeLessThan(pose.cheekRight.x)

    const tilted = poseFromPoints(points(0.3))!
    expect(tilted.angle).toBeCloseTo(0.3)
  })

  it('notices an open mouth (the puppy sticks its tongue out)', () => {
    expect(poseFromPoints(points(0, 4))!.mouthOpen).toBeLessThan(0.05)
    expect(poseFromPoints(points(0, 40))!.mouthOpen).toBeGreaterThan(0.1)
  })

  it('gives up on missing or tiny faces', () => {
    expect(poseFromPoints(() => undefined)).toBeNull()
    const tiny = points()
    expect(poseFromPoints((i) => {
      const p = tiny(i)
      return p && { x: 500 + (p.x - 500) / 100, y: 400 + (p.y - 400) / 100 }
    })).toBeNull()
  })

  it('smooths small moves but jumps to a face that moved far', () => {
    const a = poseFromPoints(points())!
    const nudged = { ...a, nose: { x: a.nose.x + 10, y: a.nose.y }, width: 210 }
    const smoothed = smoothPose(a, nudged)
    expect(smoothed.nose.x).toBeGreaterThan(a.nose.x)
    expect(smoothed.nose.x).toBeLessThan(a.nose.x + 10)

    const far = { ...a, nose: { x: a.nose.x + 400, y: a.nose.y } }
    expect(smoothPose(a, far)).toBe(far)
  })
})
