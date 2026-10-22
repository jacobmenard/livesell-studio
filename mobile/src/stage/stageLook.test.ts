import { CAMERA_FILTERS } from './filters'
import { nativeLook } from './stageLook'

jest.mock('react-native', () => ({}))

const media = [
  { id: 7, url: 'https://cdn.test/bg.jpg' },
  { id: 9, url: 'https://cdn.test/banner.png' },
]

describe('native look (same formulas as the website)', () => {
  it('maps a setup saved before the look existed to a neutral look', () => {
    const look = nativeLook({ camera: { source: 'camera', device_label: null, mirror: false, brightness: 50, zoom: 0 }, background: undefined, foreground: undefined }, [])
    expect(look).toMatchObject({ mirror: false, zoom: 1, brightness: 1, contrast: 1, saturation: 1, warmth: 0, smoothing: 0 })
    expect(look.filter.strength).toBe(0)
    expect(look.background).toMatchObject({ mode: 'image', preset: 'rack', imageUrl: null, tone: '#24324A' })
    expect(look.foreground).toBeNull()
  })

  it('uses the Enhancer uniforms for the sliders', () => {
    const look = nativeLook({ camera: { source: 'camera', device_label: null, mirror: true, brightness: 60, contrast: 40, saturation: 75, warmth: 100, smoothing: 65, zoom: 30 }, background: undefined, foreground: undefined }, [])
    expect(look.brightness).toBeCloseTo(1.1)
    expect(look.contrast).toBeCloseTo(0.9)
    expect(look.saturation).toBeCloseTo(1.5)
    expect(look.warmth).toBeCloseTo(1)
    expect(look.smoothing).toBeCloseTo(0.65)
    expect(look.zoom).toBeCloseTo(1.3)
    expect(look.mirror).toBe(true)
  })

  it('ignores zooming out on the phone and clamps bad values', () => {
    const look = nativeLook({ camera: { source: 'camera', device_label: null, mirror: false, brightness: 999, zoom: -80 }, background: undefined, foreground: undefined }, [])
    expect(look.zoom).toBe(1)
    expect(look.brightness).toBeCloseTo(1.5)
  })

  it('passes the colour grade with its strength, and fills the missing fields', () => {
    const look = nativeLook({ camera: { source: 'camera', device_label: null, mirror: false, brightness: 50, zoom: 0, filter: 'vintage', filter_strength: 60 }, background: undefined, foreground: undefined }, [])
    expect(look.filter).toEqual({
      strength: 0.6,
      gain: [1.06, 1.0, 0.86],
      contrast: 0.9,
      saturation: 0.75,
      fade: 0.12,
      shadows: [0.01, 0.03, 0.0],
      highlights: [0, 0, 0],
      mono: 0,
      vignette: 0.4,
      grain: 0.05,
    })
  })

  it('turns an unknown filter or zero strength off', () => {
    const unknown = nativeLook({ camera: { source: 'camera', device_label: null, mirror: false, brightness: 50, zoom: 0, filter: 'sepia' as never }, background: undefined, foreground: undefined }, [])
    expect(unknown.filter.strength).toBe(0)
    const zero = nativeLook({ camera: { source: 'camera', device_label: null, mirror: false, brightness: 50, zoom: 0, filter: 'bw', filter_strength: 0 }, background: undefined, foreground: undefined }, [])
    expect(zero.filter.strength).toBe(0)
  })

  it('uses the ChromaKeyer ranges for green screen', () => {
    const look = nativeLook({ camera: undefined, background: { mode: 'green', preset: 'loft', media_id: null, key_color: 'blue', similarity: 100, smoothness: 0 }, foreground: undefined }, [])
    expect(look.background.key).toEqual([0.0, 0.28, 0.73])
    expect(look.background.similarity).toBeCloseTo(0.4)
    expect(look.background.smoothness).toBeCloseTo(0.002)
  })

  it('uses the seller’s photo when it exists, else the built-in picture', () => {
    const own = nativeLook({ camera: undefined, background: { mode: 'image', preset: 'kitchen', media_id: 7, key_color: 'green', similarity: 42, smoothness: 18 }, foreground: undefined }, media)
    expect(own.background).toMatchObject({ imageUrl: 'https://cdn.test/bg.jpg', preset: 'kitchen' })
    const deleted = nativeLook({ camera: undefined, background: { mode: 'image', preset: 'kitchen', media_id: 99, key_color: 'green', similarity: 42, smoothness: 18 }, foreground: undefined }, media)
    expect(deleted.background).toMatchObject({ imageUrl: null, preset: 'kitchen', tone: '#4A2E24' })
  })

  it('shows the foreground only when it is on and its image exists', () => {
    expect(nativeLook({ camera: undefined, background: undefined, foreground: { enabled: true, media_id: 9, dock: 'top' } }, media).foreground).toEqual({
      url: 'https://cdn.test/banner.png',
      dock: 'top',
    })
    expect(nativeLook({ camera: undefined, background: undefined, foreground: { enabled: false, media_id: 9, dock: 'top' } }, media).foreground).toBeNull()
    expect(nativeLook({ camera: undefined, background: undefined, foreground: { enabled: true, media_id: 1, dock: 'top' } }, media).foreground).toBeNull()
  })

  it('keeps the same 17 filters as the website', () => {
    expect(CAMERA_FILTERS.map((f) => f.id)).toEqual(['none', 'fair', 'soft', 'glow', 'clear', 'warm', 'cool', 'vivid', 'pastel', 'dreamy', 'neon', 'vintage', 'film', 'retro', 'cinematic', 'bw', 'noir'])
  })
})
