import * as Application from 'expo-application'

/** The Laravel API (no trailing slash). Set EXPO_PUBLIC_API_URL in .env.local; see .env.example. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8000').replace(/\/+$/, '')

/**
 * A full address for a picture the API returns. Uploads come back as "/storage/…" (relative
 * to the server), which the native streamer and <Image> can't load on their own.
 */
export function absoluteUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  return url.startsWith('/') ? `${API_URL}${url}` : null
}

/** This APK's build number (android.versionCode in app.config.ts), compared with GET /api/mobile/version. */
export function appVersionCode(): number {
  const raw = Application.nativeBuildVersion
  const n = raw ? Number.parseInt(raw, 10) : NaN
  return Number.isFinite(n) ? n : 0
}

export function appVersionName(): string {
  return Application.nativeApplicationVersion ?? '1.0.0'
}

/** Requests that take longer than this fail with a "couldn't reach the server" message. */
export const REQUEST_TIMEOUT_MS = 15_000
