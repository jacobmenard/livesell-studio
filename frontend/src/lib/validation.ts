// Client-side checks that mirror the API's rules, so sellers see problems before sending.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function checkEmail(email: string): string | undefined {
  if (!email.trim()) return 'Enter your email.'
  if (!EMAIL.test(email.trim())) return 'Enter a valid email, like you@example.com.'
  return undefined
}

export function checkPassword(password: string): string | undefined {
  if (!password) return 'Enter your password.'
  if (password.length < 8) return 'Passwords are at least 8 characters.'
  return undefined
}

export function checkRtmpServer(server: string): string | undefined {
  const s = server.trim()
  if (!s) return 'Paste the server URL from your platform.'
  if (!/^rtmps?:\/\/[^\s/]+\.[^\s]+$/i.test(s)) return 'The server URL should start with rtmp:// or rtmps://'
  return undefined
}

export function checkStreamKey(key: string): string | undefined {
  const k = key.trim()
  if (!k) return 'Paste your stream key.'
  if (/\s/.test(k)) return 'Stream keys have no spaces. Check you copied all of it.'
  return undefined
}

/** Drops undefined entries so `Object.keys(errors).length` means "has errors". */
export function compact<T extends Record<string, string | undefined>>(errors: T): Record<string, string> {
  return Object.fromEntries(Object.entries(errors).filter(([, v]) => v !== undefined)) as Record<string, string>
}

/** A copy of `errors` without one field (used when the seller starts fixing it). */
export function withoutKey(errors: Record<string, string>, key: string): Record<string, string> {
  const next = { ...errors }
  delete next[key]
  return next
}
