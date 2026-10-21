import type { PopupConfig, SetupFull } from '@/api/types'
import { activeFromSetup, documentForApi, overlayFor, sceneFor, togglePopup } from './scene'

function popup(key: string, extra: Partial<PopupConfig> = {}): PopupConfig {
  return {
    key,
    kind: 'preset',
    preset_key: 'off10',
    label: null,
    text: null,
    color: null,
    media_id: null,
    position: 'tr',
    x: null,
    y: null,
    size: 100,
    entrance: 'pop',
    effect: 'fireworks',
    effect_repeat: 'loop',
    auto_hide: 0,
    sound: 'kaching',
    ...extra,
  }
}

function setup(popups: PopupConfig[], onScreen: { key: string; shown_at: number }[] = []): SetupFull {
  return {
    id: 7,
    name: 'Ukay night',
    description: null,
    is_template: false,
    orientation: 'portrait',
    resolution: '720p',
    background_label: 'Boutique rack',
    linked_sounds: 1,
    updated_at: null,
    camera: {},
    background: {},
    foreground: {},
    sound_settings: { volume: 80, to_stream: true, monitor: false },
    output_settings: {},
    popups,
    scene: {
      orientation: 'portrait',
      see_through: false,
      camera: { mirror: false },
      background: { mode: 'image', media_url: 'https://x.test/bg.png' },
      foreground: { enabled: false, media_url: null },
      popups: onScreen.map((s) => ({ ...popup(s.key), shown_at: s.shown_at })),
    },
  }
}

describe('popups on screen', () => {
  it('shows on the first tap and hides on the second', () => {
    const once = togglePopup([], 'a', 1)
    expect(once).toEqual([{ key: 'a', shownAt: 1 }])
    expect(togglePopup(once, 'a', 2)).toEqual([])
  })

  it('keeps the 12 newest', () => {
    let active = togglePopup([], 'k0', 0)
    for (let i = 1; i < 14; i++) active = togglePopup(active, `k${i}`, i)
    expect(active).toHaveLength(12)
    expect(active[0]?.key).toBe('k2')
    expect(active.at(-1)?.key).toBe('k13')
  })

  it('draws the overlay in the order shown and skips image popups without a picture', () => {
    const popups = [popup('a'), popup('b', { kind: 'image', preset_key: null, media_url: null }), popup('c', { preset_key: 'sold' })]
    const specs = overlayFor(popups, [
      { key: 'c', shownAt: 1 },
      { key: 'b', shownAt: 2 },
      { key: 'a', shownAt: 3 },
    ])
    expect(specs.map((s) => s.key)).toEqual(['c', 'a'])
  })

  it('restores what was on screen, ignoring popups since removed', () => {
    const s = setup([popup('a')], [
      { key: 'gone', shown_at: 1 },
      { key: 'a', shown_at: 2 },
    ])
    expect(activeFromSetup(s)).toEqual([{ key: 'a', shownAt: 2 }])
  })

  it('builds the scene the API takes, without media URLs', () => {
    const scene = sceneFor(setup([popup('a')]), [{ key: 'a', shownAt: 5 }])
    expect(scene.popups).toEqual([expect.objectContaining({ key: 'a', shown_at: 5 })])
    expect(scene.background).toEqual({ mode: 'image' })
    expect(scene.foreground).toEqual({ enabled: false })
    expect('auto_hide' in scene.popups[0]!).toBe(false)
  })

  it('trims the name and drops media URLs before saving', () => {
    const s = setup([popup('a', { media_url: 'https://x.test/p.png' })])
    const doc = documentForApi({ ...s, name: '  Ukay night  ' })
    expect(doc.name).toBe('Ukay night')
    expect('media_url' in doc.popups[0]!).toBe(false)
  })
})
