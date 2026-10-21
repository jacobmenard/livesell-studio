import * as SecureStore from 'expo-secure-store'

import type { Platform } from '@/api/types'
import { PLATFORM_BY_ID, PLATFORMS } from '@/catalog'

/**
 * Stream keys stay on this phone, in Android's Keystore-backed secure storage. They are
 * never sent to the NegosyoWork server: the phone streams straight to the platform.
 */
export interface StreamDestination {
  platform: Platform
  server: string
  key: string
  savedAt: string
}

const storageKey = (platform: Platform) => `negosyowork.stream.${platform}`

export async function loadDestination(platform: Platform): Promise<StreamDestination | null> {
  try {
    const raw = await SecureStore.getItemAsync(storageKey(platform))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StreamDestination>
    if (typeof parsed.server !== 'string' || typeof parsed.key !== 'string') return null
    return { platform, server: parsed.server, key: parsed.key, savedAt: parsed.savedAt ?? '' }
  } catch {
    return null
  }
}

export async function loadAllDestinations(): Promise<Partial<Record<Platform, StreamDestination>>> {
  const entries = await Promise.all(PLATFORMS.map(async (p) => [p.id, await loadDestination(p.id)] as const))
  return Object.fromEntries(entries.filter(([, d]) => d !== null)) as Partial<Record<Platform, StreamDestination>>
}

export async function saveDestination(platform: Platform, server: string, key: string): Promise<StreamDestination> {
  const destination: StreamDestination = { platform, server: server.trim(), key: key.trim(), savedAt: new Date().toISOString() }
  // On Android, SecureStore encrypts with a Keystore key that never leaves this phone.
  await SecureStore.setItemAsync(storageKey(platform), JSON.stringify(destination))
  return destination
}

export async function removeDestination(platform: Platform): Promise<void> {
  await SecureStore.deleteItemAsync(storageKey(platform)).catch(() => {})
}

// ---- checks (same rules as frontend/src/lib/validation.ts) ---------------------------

export function checkServer(server: string): string | undefined {
  const s = server.trim()
  if (!s) return 'Paste the server URL from your platform.'
  if (!/^rtmps?:\/\/[^\s/]+\.[^\s]+$/i.test(s)) return 'The server URL should start with rtmp:// or rtmps://'
  return undefined
}

export function checkKey(key: string): string | undefined {
  const k = key.trim()
  if (!k) return 'Paste your stream key.'
  if (/\s/.test(k)) return 'Stream keys have no spaces. Check you copied all of it.'
  return undefined
}

/** The full address the phone streams to: server + "/" + key. */
export function streamUrl(destination: Pick<StreamDestination, 'server' | 'key'>): string {
  return `${destination.server.trim().replace(/\/+$/, '')}/${destination.key.trim()}`
}

/** The last 4 characters, to show which key is saved without showing the key. */
export function keyHint(key: string): string {
  const k = key.trim()
  return k.length <= 4 ? '••••' : k.slice(-4)
}

/** The server to fill in for a platform (Facebook and YouTube have fixed ones). */
export function defaultServer(platform: Platform): string {
  return PLATFORM_BY_ID[platform].server
}
