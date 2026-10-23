import type { SetupDocument } from '@/api/types'
import { stepSummaries } from './steps'

jest.mock('react-native', () => ({}))
jest.mock('expo-application', () => ({ nativeBuildVersion: '1' }))

function doc(extra: Partial<SetupDocument> = {}): SetupDocument {
  return {
    name: 'Ukay night',
    orientation: 'portrait',
    resolution: '720p',
    camera: { source: 'phone', device_label: null, mirror: false, brightness: 55, contrast: 52, saturation: 56, warmth: 66, smoothing: 30, filter: 'warm', zoom: 0 },
    background: { mode: 'image', preset: 'loft', media_id: null, key_color: 'green', similarity: 42, smoothness: 18 },
    foreground: { enabled: false, media_id: null, dock: 'bottom' },
    sound_settings: { volume: 70, to_stream: true, monitor: false },
    output_settings: {},
    popups: [],
    ...extra,
  }
}

describe('what each editor step is set to', () => {
  it('names the look, filter, picture, popups and sounds', () => {
    expect(stepSummaries(doc(), [])).toEqual({
      camera: 'Warm · Golden',
      background: 'Picture · Studio loft',
      popups: 'None yet',
      foreground: 'Off',
      sounds: 'Medium · viewers hear',
    })
  })

  it('says "your own" for a hand-made look and a seller’s photo', () => {
    const s = stepSummaries(
      doc({
        camera: { source: 'phone', device_label: null, mirror: false, brightness: 80, zoom: 0 },
        background: { mode: 'green', preset: 'rack', media_id: 4, key_color: 'green', similarity: 42, smoothness: 18 },
        foreground: { enabled: true, media_id: 9, dock: 'top' },
        sound_settings: { volume: 40, to_stream: false, monitor: false },
      }),
      [{ id: 4, kind: 'background', url: '/storage/bg.jpg' }],
    )
    expect(s).toMatchObject({ camera: 'Your own look', background: 'Green screen · Your photo', foreground: 'On · top', sounds: 'Soft · only you' })
  })

  it('shows only the mode for None and Blur, and counts popups', () => {
    const s = stepSummaries(doc({ background: { mode: 'blur', preset: 'rack', media_id: null, key_color: 'green', similarity: 42, smoothness: 18 } }), [])
    expect(s.background).toBe('Blur')
    const one = stepSummaries(doc({ popups: [{ key: 'a' } as SetupDocument['popups'][number]] }), [])
    expect(one.popups).toBe('1 in this setup')
  })
})
