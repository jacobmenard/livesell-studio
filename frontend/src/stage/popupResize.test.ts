import { describe, expect, it } from 'vitest'
import { resizeAnchor, resizeScale } from './EditablePopupLayer'

// A popup box 200 × 100 with its top-left corner at (100, 100).
const box = { left: 100, top: 100, right: 300, bottom: 200 }

describe('resizing a popup', () => {
  it('keeps the opposite corner or edge still', () => {
    expect(resizeAnchor('se', box)).toEqual({ handleX: 300, handleY: 200, anchorX: 100, anchorY: 100 })
    expect(resizeAnchor('nw', box)).toEqual({ handleX: 100, handleY: 100, anchorX: 300, anchorY: 200 })
    expect(resizeAnchor('e', box)).toEqual({ handleX: 300, handleY: 150, anchorX: 100, anchorY: 150 })
    expect(resizeAnchor('w', box)).toEqual({ handleX: 100, handleY: 150, anchorX: 300, anchorY: 150 })
    expect(resizeAnchor('n', box)).toEqual({ handleX: 200, handleY: 100, anchorX: 200, anchorY: 200 })
    expect(resizeAnchor('s', box)).toEqual({ handleX: 200, handleY: 200, anchorX: 200, anchorY: 100 })
  })

  it('a side handle follows the pointer across, ignoring up and down', () => {
    const right = resizeAnchor('e', box)
    expect(resizeScale(right, 500, 150)).toBeCloseTo(2) // 400 wide instead of 200
    expect(resizeScale(right, 500, 900)).toBeCloseTo(2)
    expect(resizeScale(resizeAnchor('w', box), 200, 150)).toBeCloseTo(0.5)
  })

  it('a top or bottom handle follows the pointer up and down', () => {
    expect(resizeScale(resizeAnchor('s', box), 999, 250)).toBeCloseTo(1.5)
    expect(resizeScale(resizeAnchor('n', box), 0, 150)).toBeCloseTo(0.5)
  })

  it('a corner follows the pointer along the diagonal', () => {
    const corner = resizeAnchor('se', box)
    expect(resizeScale(corner, 500, 300)).toBeCloseTo(2)
    expect(resizeScale(corner, 300, 200)).toBeCloseTo(1)
  })
})
