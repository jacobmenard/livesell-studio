import type { PopupConfig, TextColor } from '@/api/types'

/** Same limit as the API and the website (24 characters, printable only). */
export const MAX_TEXT_LENGTH = 24

/** A short, valid popup key for a new text popup (matches the API's /^[a-z0-9][a-z0-9-]{0,39}$/). */
export function newPopupKey(prefix: 'txt' | 'img', now = Date.now(), random = Math.random()): string {
  return `${prefix}-${now.toString(36)}${Math.floor(random * 1296).toString(36)}`
}

export function checkPopupText(text: string): string | undefined {
  const clean = text.trim()
  if (!clean) return 'Type the words for your popup first.'
  if (clean.length > MAX_TEXT_LENGTH) return `Keep it to ${MAX_TEXT_LENGTH} characters.`
  if (/[\u0000-\u001F\u007F]/.test(clean)) return 'Use letters, numbers and symbols only.'
  return undefined
}

export function newTextPopup(text: string, color: TextColor, key = newPopupKey('txt')): PopupConfig {
  return {
    key,
    kind: 'text',
    preset_key: null,
    label: text.trim(),
    text: text.trim(),
    color,
    media_id: null,
    position: 'mc',
    x: null,
    y: null,
    size: 100,
    entrance: 'pop',
    effect: 'none',
    effect_repeat: 'once',
    auto_hide: 0,
    sound: null,
  }
}

export function updatePopup(popups: PopupConfig[], key: string, change: Partial<PopupConfig>): PopupConfig[] {
  return popups.map((p) => (p.key === key ? { ...p, ...change } : p))
}

/** Built-in popups can't be deleted (the API puts them back); custom ones can. */
export function removePopup(popups: PopupConfig[], key: string): PopupConfig[] {
  return popups.filter((p) => p.key !== key || p.kind === 'preset')
}
