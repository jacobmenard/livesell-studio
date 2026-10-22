import type { PopupConfig } from '@/api/types'
import { nearTop, parseBorder, parseDeg, placement, popupText, resolveLook, sizeScale } from './look'

function preset(key: PopupConfig['preset_key'], extra: Partial<PopupConfig> = {}): PopupConfig {
  return {
    key: `p-${key}`,
    kind: 'preset',
    preset_key: key,
    label: null,
    text: null,
    color: null,
    media_id: null,
    position: 'tr',
    x: null,
    y: null,
    size: 100,
    entrance: 'pop',
    effect: 'none',
    effect_repeat: 'once',
    auto_hide: 0,
    sound: null,
    ...extra,
  }
}

describe('look (same rules as the web stage)', () => {
  it('sizes text at 6.2 units for Medium and scales with size', () => {
    expect(resolveLook(preset('off10')).fontU).toBeCloseTo(6.2)
    expect(resolveLook(preset('off10', { size: 158 })).fontU).toBeCloseTo(9.8, 1)
  })

  it('keeps size inside the API limits', () => {
    expect(sizeScale(10)).toBeCloseTo(0.4)
    expect(sizeScale(99999)).toBeCloseTo(15)
    expect(sizeScale(Number.NaN)).toBe(1)
  })

  it('places the 9-grid spots with 6% / 5% margins', () => {
    expect(placement('tl')).toEqual({ anchorX: 0.05, anchorY: 0.06, alignX: 0, alignY: 0 })
    expect(placement('mc')).toEqual({ anchorX: 0.5, anchorY: 0.5, alignX: -0.5, alignY: -0.5 })
    expect(placement('br')).toEqual({ anchorX: 0.95, anchorY: 0.94, alignX: -1, alignY: -1 })
  })

  it('centres a dragged popup on its x / y', () => {
    const look = resolveLook(preset('free', { x: 30, y: 70 }))
    expect(look).toMatchObject({ anchorX: 0.3, anchorY: 0.7, alignX: -0.5, alignY: -0.5 })
  })

  it('reads preset colours, shape, rotation and border', () => {
    const flash = resolveLook(preset('flash'))
    expect(flash).toMatchObject({ text: 'FLASH SALE', bg: '#0D0C10', fg: '#F5C542', shape: 'tag', rotDeg: -4, borderColor: '#F5C542' })
    expect(flash.borderEm).toBeCloseTo(0.12)
    expect(resolveLook(preset('live'))).toMatchObject({ shape: 'pill', rotDeg: 0, borderColor: null })
  })

  it('draws custom text popups as a tilted tag in the chosen colour', () => {
    const look = resolveLook(preset(null, { kind: 'text', text: 'PROMO', color: 'blue' }))
    expect(look).toMatchObject({ kind: 'text', text: 'PROMO', bg: '#8AB4FF', shape: 'tag', rotDeg: -3 })
  })

  it('uses the picture for image popups', () => {
    const look = resolveLook(preset(null, { kind: 'image', label: 'Logo', media_url: 'https://x.test/a.png' }))
    expect(look).toMatchObject({ kind: 'image', imageUrl: 'https://x.test/a.png', text: 'Logo' })
    expect(look.imageU).toBeCloseTo(24.4)
  })

  it('parses css bits safely', () => {
    expect(parseDeg('-8deg')).toBe(-8)
    expect(parseDeg('oops')).toBe(0)
    expect(parseBorder(undefined)).toEqual({ em: 0, color: null })
    expect(parseBorder('0 solid transparent')).toEqual({ em: 0, color: null })
  })

  it('shows preset text, custom text or the image label', () => {
    expect(popupText(preset('sold'))).toBe('SOLD OUT')
    expect(popupText(preset(null, { kind: 'text', text: 'HI' }))).toBe('HI')
    expect(popupText(preset(null, { kind: 'image', label: null }))).toBe('Image')
  })

  it('carries the entrance and effect for the native renderer, drawn still unless shown at a time', () => {
    const still = resolveLook(preset('off10', { entrance: 'bounce', effect: 'confetti', effect_repeat: 'loop' }))
    expect(still).toMatchObject({ entrance: 'bounce', effect: 'confetti', effectLoop: true, shownAt: 0 })
    expect(resolveLook(preset('off10'), 1_700_000_000_000).shownAt).toBe(1_700_000_000_000)
  })

  it('knows when a popup is in the top part, where banderitas hang below it', () => {
    expect(nearTop({ position: 'tr', x: null, y: null })).toBe(true)
    expect(nearTop({ position: 'tr', x: 50, y: 70 })).toBe(false)
    expect(nearTop({ position: 'bc', x: 20, y: 10 })).toBe(true)
    expect(resolveLook(preset('off10', { position: 'bl' })).topRow).toBe(false)
  })
})
