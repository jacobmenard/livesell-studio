/** 754 → "12:34", 3754 → "1:02:34" */
export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0')
  return h > 0 ? `${h}:${mm}:${String(sec).padStart(2, '0')}` : `${mm}:${String(sec).padStart(2, '0')}`
}

/** 5040 → "1h 24m", 300 → "5m", 42 → "42s" */
export function duration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  if (s < 60) return `${s}s`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

/** How the connection looks to the seller, from the native status and stats. */
export function signal(status: string | undefined, congestion: number | undefined): { label: string; tone: 'good' | 'weak' | 'lost' } {
  if (status === 'reconnecting' || status === 'failed') return { label: 'Signal lost', tone: 'lost' }
  if (status === 'connecting') return { label: 'Connecting…', tone: 'weak' }
  if (congestion !== undefined && congestion >= 50) return { label: 'Weak signal', tone: 'weak' }
  return { label: 'Good signal', tone: 'good' }
}

/** A plain reason for a failed live. */
export function failureMessage(reason: string | null | undefined, platform: string): string {
  if (reason === 'auth') return `${platform} refused the stream key. Check it on the Platforms tab, or make a new key on ${platform}.`
  const r = (reason ?? '').toLowerCase()
  if (r.includes('timeout') || r.includes('unreachable') || r.includes('network') || r.includes('host')) {
    return `We couldn't reach ${platform}. Check your internet, then try again.`
  }
  return `The live to ${platform} stopped. Check your internet and stream key, then try again.`
}
