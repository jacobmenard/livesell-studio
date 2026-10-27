/**
 * The Android app opens the website signed in with a link like
 *   /handoff#code=<one-time code>&next=/plans
 * The code is after the #, so the browser never sends it to a server (logs, Referer headers).
 */
export interface Handoff {
  code: string
  /** A page of this website to open once signed in. */
  next: string
}

/** The code and page from a hand-off link's fragment, or null if it isn't one. */
export function readHandoff(hash: string): Handoff | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const code = params.get('code') ?? ''
  if (!/^[A-Za-z0-9]{48}$/.test(code)) return null
  return { code, next: safeNext(params.get('next')) }
}

/** Only a page of this website (never "//other.site" or "https://…"); the dashboard otherwise. */
export function safeNext(path: string | null): string {
  return path && /^\/[a-z][a-z0-9/-]*$/.test(path) ? path : '/setups'
}
