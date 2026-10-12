import { describe, expect, it } from 'vitest'
import type { MediaItem, PopupConfig, SetupDocument } from '../lib/types'
import { fxParts } from './fx'
import { pickMimeType } from './broadcast'
import { coverCrop, maskAlpha, outputSize, placeCamera } from './geometry'
import { clampPopupSize, fitSize, placeOnStage } from './EditablePopupLayer'
import { nearTop, placement, popupText, resolveLook, sizeScale } from './look'
import { buildScene, documentForApi, newPopupKey, sameDocument, sceneForApi, stableStringify } from './scene'

const preset = (key: PopupConfig['preset_key'] & string, extra: Partial<PopupConfig> = {}): PopupConfig => ({
  key,
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
})

const doc = (popups: PopupConfig[]): SetupDocument => ({
  name: 'Saturday sale',
  orientation: 'portrait',
  resolution: '1080p',
  camera: { source: 'camera', device_label: null, mirror: false, brightness: 50, zoom: 0, audio: true },
  background: { mode: 'image', preset: 'rack', media_id: 7, key_color: 'green', similarity: 42, smoothness: 18 },
  foreground: { enabled: true, media_id: 9, dock: 'top' },
  sound_settings: { volume: 70, to_stream: true, monitor: true },
  output_settings: { method: 'window', see_through: false, safe_zones: false },
  popups,
})

const media = (id: number, kind: MediaItem['kind']): MediaItem => ({ id, kind, label: `m${id}`, url: `https://cdn.test/${id}.png`, mime: 'image/png', size: 1, width: 1, height: 1 })

describe('effects', () => {
  it('builds stable particle layouts', () => {
    expect(fxParts('fireworks')).toHaveLength(36)
    expect(fxParts('confetti')).toHaveLength(26)
    expect(fxParts('none')).toHaveLength(0)
    expect(fxParts('sparkle')).toEqual(fxParts('sparkle'))
  })
})

describe('geometry', () => {
  it('sizes the output for each shape and quality', () => {
    expect(outputSize('portrait', '1080p')).toEqual({ width: 1080, height: 1920 })
    expect(outputSize('landscape', '720p')).toEqual({ width: 1280, height: 720 })
  })

  it('crops a landscape camera to fill a portrait stage', () => {
    const [sx, sy, sw, sh] = coverCrop(1920, 1080, 1080, 1920)
    expect(sh).toBe(1080)
    expect(sw).toBeCloseTo(607.5)
    expect(sx).toBeCloseTo((1920 - 607.5) / 2)
    expect(sy).toBe(0)
  })

  it('zooms towards the centre', () => {
    const [sx, sy, sw, sh] = coverCrop(1920, 1080, 1920, 1080, 100)
    expect([sx, sy, sw, sh]).toEqual([480, 270, 960, 540])
  })

  it('places the camera like coverCrop from zoom 0 up', () => {
    expect(placeCamera(1920, 1080, 1080, 1920, 0)).toEqual({ src: coverCrop(1920, 1080, 1080, 1920), dst: [0, 0, 1080, 1920] })
    expect(placeCamera(1920, 1080, 1080, 1920, 40).src).toEqual(coverCrop(1920, 1080, 1080, 1920, 40))
  })

  it('zoomed fully out, shows the whole landscape camera across a portrait stage', () => {
    const { src, dst } = placeCamera(1920, 1080, 1080, 1920, -100)
    expect(src).toEqual([0, 0, 1920, 1080])
    expect(dst[0]).toBe(0)
    expect(dst[2]).toBeCloseTo(1080)
    expect(dst[3]).toBeCloseTo(607.5)
    expect(dst[1]).toBeCloseTo((1920 - 607.5) / 2)
  })

  it('zooming part-way out shows more width than filling, still centred', () => {
    const { src, dst } = placeCamera(1920, 1080, 1080, 1920, -50)
    const filled = coverCrop(1920, 1080, 1080, 1920)
    expect(src[2]).toBeGreaterThan(filled[2])
    expect(src[0] * 2 + src[2]).toBeCloseTo(1920)
    expect(dst[3]).toBeLessThan(1920)
    expect(dst[1] * 2 + dst[3]).toBeCloseTo(1920)
  })

  it('records in the best format the browser supports', () => {
    expect(pickMimeType((t) => t.includes('vp9'))).toBe('video/webm;codecs=vp9,opus')
    expect(pickMimeType(() => true)).toBe('video/webm;codecs=h264,opus')
    expect(pickMimeType(() => false)).toBeNull()
  })

  it('turns confidence into a soft alpha edge', () => {
    expect(maskAlpha(0)).toBe(0)
    expect(maskAlpha(0.5)).toBe(128)
    expect(maskAlpha(1)).toBe(255)
  })
})

describe('popup look', () => {
  it('scales text and images freely with the popup size, within limits', () => {
    expect(resolveLook(preset('off10')).fontU).toBeCloseTo(6.2)
    expect(resolveLook(preset('off10', { size: 158 })).fontU).toBeCloseTo(9.8, 1)
    expect(resolveLook(preset('off10', { size: 135 })).imageU).toBeCloseTo(24.4 * 1.35)
    expect(sizeScale(10)).toBe(0.4)
    expect(sizeScale(900)).toBe(9)
    expect(sizeScale(5000)).toBe(15)
    expect(sizeScale(Number.NaN)).toBe(1)
  })

  it('centres a dragged popup on its x / y, and keeps grid spots for the rest', () => {
    const dragged = resolveLook(preset('off10', { x: 30, y: 72.5 }))
    expect([dragged.left, dragged.top, dragged.tx, dragged.ty]).toEqual(['30%', '72.5%', '-50%', '-50%'])
    const spot = resolveLook(preset('off10', { position: 'tr' }))
    expect([spot.left, spot.top, spot.tx, spot.ty]).toEqual(['95%', '6%', '-100%', '0%'])
    // Half a point isn't a position: both coordinates are needed.
    expect(resolveLook(preset('off10', { position: 'tr', x: 30 })).left).toBe('95%')
  })

  it('drops effects downwards for popups near the top, wherever they were placed', () => {
    expect(nearTop(preset('off10', { position: 'tl' }))).toBe(true)
    expect(nearTop(preset('off10', { position: 'tl', x: 50, y: 80 }))).toBe(false)
    expect(nearTop(preset('off10', { position: 'bl', x: 50, y: 10 }))).toBe(true)
    expect(clampPopupSize(12)).toBe(40)
    expect(clampPopupSize(137.6)).toBe(138)
    expect(clampPopupSize(900, 480)).toBe(480)
  })

  it('lets a popup grow until it is exactly as wide as the screen, whatever its height', () => {
    const landscape = { width: 1000, height: 562 }
    expect(fitSize(100, { width: 200 }, landscape)).toBe(500)
    // A tall image isn't stopped by the screen height: it reaches the full width too.
    expect(fitSize(250, { width: 100 }, landscape)).toBe(2500)
    expect(fitSize(100, { width: 0 }, landscape)).toBe(1500)
  })

  it('keeps popups on screen, and lets one taller than the screen slide without leaving a gap', () => {
    const stage = { left: 0, top: 0, right: 1000, bottom: 562, width: 1000, height: 562 } as DOMRect
    const measured = (boxWidth: number, boxHeight: number) => ({ stage, size: 100, boxWidth, boxHeight, centerX: 500, centerY: 281, maxSize: 500 })

    // Dragged past the right edge: stops with its right side on the edge.
    expect(placeOnStage(measured(200, 60), 990, 281, 100)).toEqual({ x: 90, y: 50 })
    // Twice the screen height: it can move up and down, but always covers top to bottom.
    const tall = measured(1000, 1124)
    expect(placeOnStage(tall, 500, -400, 100).y).toBe(0)
    expect(placeOnStage(tall, 500, 900, 100).y).toBe(100)
    expect(placeOnStage(tall, 500, 140.5, 100).y).toBe(25)
  })

  it('uses the catalog for built-in popups', () => {
    const look = resolveLook(preset('off10'))
    expect(look.text).toBe('10% OFF')
    expect(look.bg).toBe('#F5C542')
    expect(look.shape).toBe('tag')
  })

  it('places popups in the nine spots', () => {
    expect(placement('tl')).toEqual({ top: '6%', ty: '0%', left: '5%', tx: '0%' })
    expect(placement('mc')).toEqual({ top: '50%', ty: '-50%', left: '50%', tx: '-50%' })
    expect(placement('br')).toEqual({ top: '94%', ty: '-100%', left: '95%', tx: '-100%' })
  })

  it('shows typed text as plain text', () => {
    const p: PopupConfig = { ...preset('off10'), key: 'txt-1', kind: 'text', preset_key: null, text: '<b>₱99</b>', color: 'blue' }
    expect(popupText(p)).toBe('<b>₱99</b>')
    expect(resolveLook(p).bg).toBe('#8AB4FF')
  })
})

describe('scene', () => {
  it('includes only popups that are showing, in the order shown', () => {
    const d = doc([preset('off10'), preset('live'), preset('free')])
    const scene = buildScene(
      d,
      [
        { key: 'free', shownAt: 1 },
        { key: 'off10', shownAt: 2 },
      ],
      [media(7, 'background')],
      'HD Webcam',
    )
    expect(scene.popups.map((p) => p.key)).toEqual(['free', 'off10'])
    expect(scene.camera.device_label).toBe('HD Webcam')
    expect(scene.background.media_url).toBe('https://cdn.test/7.png')
  })

  it('drops image popups whose file is gone and falls back from a deleted background', () => {
    const img: PopupConfig = { ...preset('off10'), key: 'img-1', kind: 'image', preset_key: null, media_id: 99 }
    const scene = buildScene(doc([img]), [{ key: 'img-1', shownAt: 1 }], [], null)
    expect(scene.popups).toHaveLength(0)
    expect(scene.background.media_id).toBeNull()
  })

  it('never sends URLs to the API', () => {
    const scene = buildScene(doc([preset('off10')]), [{ key: 'off10', shownAt: 1 }], [media(7, 'background'), media(9, 'foreground')], null)
    const body = sceneForApi(scene)
    expect(JSON.stringify(body)).not.toContain('media_url')
    expect(body.foreground).toEqual({ enabled: true, media_id: 9, dock: 'top' })
  })

  it('puts the foreground image on the live, and drops it if the upload is gone', () => {
    const live = buildScene(doc([]), [], [media(9, 'foreground')], null)
    expect(live.foreground).toEqual({ enabled: true, media_id: 9, dock: 'top', media_url: 'https://cdn.test/9.png' })

    const deleted = buildScene(doc([]), [], [], null)
    expect(deleted.foreground.media_url).toBeNull()
    expect(deleted.foreground.media_id).toBeNull()
  })

  it('compares documents regardless of key order', () => {
    const a = doc([preset('off10')])
    const b = JSON.parse(stableStringify(a)) as SetupDocument
    expect(sameDocument(a, b)).toBe(true)
    expect(sameDocument(a, { ...a, name: 'Other' })).toBe(false)
    expect(documentForApi({ ...a, name: '  Trim me ' }).name).toBe('Trim me')
  })

  it('makes keys the API accepts', () => {
    expect(newPopupKey('txt')).toMatch(/^[a-z0-9][a-z0-9-]{0,39}$/)
  })
})
