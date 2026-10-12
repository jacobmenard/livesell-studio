import type { BackgroundSettings, CameraSettings, MediaItem, ForegroundSettings, PopupConfig, Scene, ScenePopup, SetupDocument, SetupFull } from '../lib/types'
import { MAX_POPUPS_ON_SCREEN } from './catalog'

/** Same as the API's default: off until an image is picked. */
export const DEFAULT_FOREGROUND: ForegroundSettings = { enabled: false, media_id: null, dock: 'bottom' }

/** A popup that is on screen, and when it was shown (to replay its entrance). */
export interface ActivePopup {
  key: string
  shownAt: number
}

/** The editable part of a setup, as the editor keeps it. */
export function documentFromSetup(setup: SetupFull): SetupDocument {
  return {
    name: setup.name,
    orientation: setup.orientation,
    resolution: setup.resolution,
    camera: { ...setup.camera },
    background: { ...setup.background },
    foreground: { ...DEFAULT_FOREGROUND, ...setup.foreground },
    sound_settings: { ...setup.sound_settings },
    output_settings: { ...setup.output_settings },
    popups: setup.popups.map((p) => ({ ...p })),
  }
}

/** Popups on screen when the setup was last used, in the order they were shown. */
export function activeFromSetup(setup: SetupFull): ActivePopup[] {
  const keys = new Set(setup.popups.map((p) => p.key))
  return setup.scene.popups.filter((p) => keys.has(p.key)).map((p) => ({ key: p.key, shownAt: p.shown_at }))
}

/**
 * What the clean screen should draw right now: the current (maybe unsaved) settings
 * plus the popups that are showing. Media URLs come from the seller's uploads.
 */
export function buildScene(doc: SetupDocument, active: ActivePopup[], media: MediaItem[], deviceLabel: string | null): Scene {
  const urls = new Map(media.map((m) => [m.id, m.url]))
  const byKey = new Map(doc.popups.map((p) => [p.key, p]))

  const popups: ScenePopup[] = []
  for (const a of active.slice(-MAX_POPUPS_ON_SCREEN)) {
    const p = byKey.get(a.key)
    if (!p) continue
    if (p.kind === 'image' && !(p.media_id && urls.has(p.media_id))) continue
    popups.push({
      key: p.key,
      kind: p.kind,
      preset_key: p.preset_key,
      label: p.label,
      text: p.text,
      color: p.color,
      media_id: p.media_id,
      media_url: p.media_id ? (urls.get(p.media_id) ?? null) : null,
      position: p.position,
      x: p.x ?? null,
      y: p.y ?? null,
      size: p.size,
      entrance: p.entrance,
      effect: p.effect,
      effect_repeat: p.effect_repeat,
      shown_at: a.shownAt,
    })
  }

  const bgUrl = doc.background.media_id ? (urls.get(doc.background.media_id) ?? null) : null
  const foregroundUrl = doc.foreground.media_id ? (urls.get(doc.foreground.media_id) ?? null) : null
  const camera: CameraSettings = { ...doc.camera, device_label: deviceLabel ?? doc.camera.device_label }

  return {
    orientation: doc.orientation,
    see_through: doc.output_settings.see_through,
    camera,
    // A deleted background photo falls back to the built-in picture.
    background: { ...doc.background, media_id: bgUrl ? doc.background.media_id : null, media_url: bgUrl },
    // A deleted foreground image simply isn't shown.
    foreground: { ...doc.foreground, media_id: foregroundUrl ? doc.foreground.media_id : null, media_url: foregroundUrl },
    popups,
  }
}

/** The scene as the API accepts it (no URLs: the server resolves media itself). */
export function sceneForApi(scene: Scene): Scene {
  const background: BackgroundSettings = {
    mode: scene.background.mode,
    preset: scene.background.preset,
    media_id: scene.background.media_id,
    key_color: scene.background.key_color,
    similarity: scene.background.similarity,
    smoothness: scene.background.smoothness,
  }
  return {
    orientation: scene.orientation,
    see_through: scene.see_through,
    camera: { ...scene.camera },
    background,
    foreground: { enabled: scene.foreground.enabled, media_id: scene.foreground.media_id, dock: scene.foreground.dock },
    popups: scene.popups.map(({ media_url: _url, ...p }) => p),
  }
}

/** The document as the API accepts it. */
export function documentForApi(doc: SetupDocument): SetupDocument {
  return {
    ...doc,
    name: doc.name.trim(),
    popups: doc.popups.map(({ media_url: _url, ...p }): PopupConfig => p),
  }
}

/** JSON with object keys sorted, so equal values always give equal strings. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  )
}

/** Compares two documents ("Not saved yet" vs "All changes saved"). */
export function sameDocument(a: SetupDocument, b: SetupDocument): boolean {
  return stableStringify(documentForApi(a)) === stableStringify(documentForApi(b))
}

/** A short, valid popup key for a new text or image popup. */
export function newPopupKey(prefix: 'txt' | 'img'): string {
  return `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`
}
