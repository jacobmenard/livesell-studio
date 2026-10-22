import type { MediaItem, PopupConfig, Scene, ScenePopup, SetupDocument, SetupFull } from '@/api/types'
import { MAX_POPUPS_ON_SCREEN } from '@/catalog'
import { backgroundOf, foregroundOf, foregroundSpec, type ForegroundDrawSpec } from './background'
import { resolveLook, type PopupDrawSpec } from './look'

/** A popup that is on screen, and when it was shown. */
export interface ActivePopup {
  key: string
  shownAt: number
}

/** The editable part of a setup, as PUT /api/setups/{id} takes it (see frontend/src/stage/scene.ts). */
export function documentFromSetup(setup: SetupFull): SetupDocument {
  return {
    name: setup.name,
    orientation: setup.orientation,
    resolution: setup.resolution,
    camera: { ...setup.camera },
    background: backgroundOf(setup.background),
    foreground: foregroundOf(setup.foreground),
    sound_settings: { ...setup.sound_settings },
    output_settings: { ...setup.output_settings },
    popups: setup.popups.map((p) => ({ ...p })),
  }
}

/** The document without server-only fields (the API resolves media URLs itself). */
export function documentForApi(doc: SetupDocument): SetupDocument {
  return {
    ...doc,
    name: doc.name.trim(),
    popups: doc.popups.map(({ media_url: _url, ...p }): PopupConfig => p),
  }
}

/** Shows a popup (on top), or hides it if it is showing. Keeps at most 12 on screen. */
export function togglePopup(active: ActivePopup[], key: string, now: number): ActivePopup[] {
  if (active.some((a) => a.key === key)) return active.filter((a) => a.key !== key)
  return [...active, { key, shownAt: now }].slice(-MAX_POPUPS_ON_SCREEN)
}

export function hidePopup(active: ActivePopup[], key: string): ActivePopup[] {
  return active.filter((a) => a.key !== key)
}

/** Popups showing when the setup was last used, in the order they were shown. */
export function activeFromSetup(setup: SetupFull): ActivePopup[] {
  const keys = new Set(setup.popups.map((p) => p.key))
  return setup.scene.popups.filter((p) => keys.has(p.key)).map((p) => ({ key: p.key, shownAt: p.shown_at }))
}

function visible(popups: PopupConfig[], active: ActivePopup[]): { popup: PopupConfig; shownAt: number }[] {
  const byKey = new Map(popups.map((p) => [p.key, p]))
  const out: { popup: PopupConfig; shownAt: number }[] = []
  for (const a of active.slice(-MAX_POPUPS_ON_SCREEN)) {
    const popup = byKey.get(a.key)
    // An image popup whose picture was deleted can't be drawn.
    if (!popup || (popup.kind === 'image' && !popup.media_url)) continue
    out.push({ popup, shownAt: a.shownAt })
  }
  return out
}

/**
 * What the native streamer draws into the video, bottom to top: the foreground first (popups
 * show on top of it, as on the web), then the popups (last shown on top).
 */
export function overlayFor(
  popups: PopupConfig[],
  active: ActivePopup[],
  foreground?: { settings: unknown; media: MediaItem[] | undefined },
): (ForegroundDrawSpec | PopupDrawSpec)[] {
  const banner = foreground ? foregroundSpec(foregroundOf(foreground.settings), foreground.media) : null
  const specs = visible(popups, active).map(({ popup }) => resolveLook(popup))
  return banner ? [banner, ...specs] : specs
}

/** The setup's "on screen now" for PUT /api/setups/{id}/scene, so the website can follow along. */
export function sceneFor(setup: SetupFull, active: ActivePopup[]): Scene {
  const popups: ScenePopup[] = visible(setup.popups, active).map(({ popup, shownAt }) => ({
    key: popup.key,
    kind: popup.kind,
    preset_key: popup.preset_key,
    label: popup.label,
    text: popup.text,
    color: popup.color,
    media_id: popup.media_id,
    position: popup.position,
    x: popup.x ?? null,
    y: popup.y ?? null,
    size: popup.size,
    entrance: popup.entrance,
    effect: popup.effect,
    effect_repeat: popup.effect_repeat,
    shown_at: shownAt,
  }))
  // The setup's own background and foreground (what the seller chose, on the phone or the web),
  // not the last live's: the website's clean screen follows what the phone shows now.
  return {
    orientation: setup.orientation,
    see_through: setup.scene.see_through,
    camera: setup.scene.camera,
    background: { ...backgroundOf(setup.background) },
    foreground: { ...foregroundOf(setup.foreground) },
    popups,
  }
}
