import { useEffect, useState } from 'react'
import { adminApi } from './endpoints'

const CHANGED = 'negosyowork:payments-changed'
const POLL_MS = 60_000

/** Tell the header badge a payment was just reviewed (so it doesn't wait for the next poll). */
export function notifyPaymentsChanged(): void {
  window.dispatchEvent(new Event(CHANGED))
}

/**
 * How many payments wait for the superadmin, kept fresh while the tab is open: every
 * minute, when the tab comes back into view, and right after a review.
 */
export function usePendingPayments(enabled: boolean): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const load = () => {
      if (document.visibilityState === 'hidden') return
      adminApi
        .pendingPayments()
        .then((n) => !cancelled && setCount(n))
        .catch(() => {
          // Keep the last count; the next poll tries again.
        })
    }
    load()
    const timer = window.setInterval(load, POLL_MS)
    document.addEventListener('visibilitychange', load)
    window.addEventListener(CHANGED, load)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', load)
      window.removeEventListener(CHANGED, load)
    }
  }, [enabled])

  return enabled ? count : 0
}
