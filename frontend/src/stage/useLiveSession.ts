import { isAxiosError } from 'axios'
import { useEffect, useState } from 'react'
import { liveSessionApi, liveSessionUrl, type LiveSessionTarget } from '../lib/endpoints'

/** preview: the Free plan's own window, shown watermarked (it can't go live). */
export type LiveSessionStatus = { state: 'starting' | 'live' | 'limit' | 'preview'; message: string }

// While the plan's limit is reached, check again this often: the screen comes on by itself
// as soon as another live ends. Network hiccups retry sooner.
const RETRY_LIMIT_MS = 30_000
const RETRY_ERROR_MS = 10_000

/** A 409 from the plan's live limit (preview = the Free plan may show a watermarked preview), else null. */
function limitReached(error: unknown): { message: string; preview: boolean } | null {
  if (!isAxiosError(error) || error.response?.status !== 409) return null
  const data = error.response.data as { message?: string; preview?: boolean } | undefined
  return { message: data?.message ?? 'Your plan’s limit of setups live at once is reached.', preview: data?.preview === true }
}

/** Ends a session while the page unloads: fetch with keepalive outlives the page (axios can't). */
function endOnUnload(url: string) {
  const xsrf = document.cookie
    .split('; ')
    .find((c) => c.startsWith('XSRF-TOKEN='))
    ?.slice('XSRF-TOKEN='.length)
  void fetch(url, {
    method: 'DELETE',
    keepalive: true,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...(xsrf ? { 'X-XSRF-TOKEN': decodeURIComponent(xsrf) } : {}) },
  }).catch(() => {
    /* the session expires on its own after 90 s */
  })
}

/**
 * Keeps an open clean screen counted as live (start, heartbeats, end), so the plan's limit
 * on setups live at once holds. Pass null until the screen has something to show.
 */
export function useLiveSession(target: LiveSessionTarget | null): LiveSessionStatus {
  const [status, setStatus] = useState<LiveSessionStatus>({ state: 'starting', message: '' })

  useEffect(() => {
    if (!target) return
    let cancelled = false
    let id: string | null = null
    let timer: number | undefined
    const later = (ms: number) => {
      timer = window.setTimeout(() => void tick(), ms)
    }

    const tick = async () => {
      try {
        const session = id ? await liveSessionApi.beat(target, id) : await liveSessionApi.start(target)
        if (cancelled) {
          // Closed while starting: give the slot straight back.
          void liveSessionApi.end(target, session.id).catch(() => {})
          return
        }
        id = session.id
        setStatus({ state: 'live', message: '' })
        later(session.heartbeat_seconds * 1000)
      } catch (error) {
        if (cancelled) return
        const limit = limitReached(error)
        if (limit) {
          id = null
          setStatus({ state: limit.preview ? 'preview' : 'limit', message: limit.message })
          later(RETRY_LIMIT_MS)
        } else if (isAxiosError(error) && error.response?.status === 404 && id) {
          // The session is gone (ended elsewhere): start a new one.
          id = null
          void tick()
        } else {
          later(RETRY_ERROR_MS)
        }
      }
    }

    void tick()
    const onPageHide = () => {
      if (id) endOnUnload(liveSessionUrl(target, id))
    }
    window.addEventListener('pagehide', onPageHide)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      window.removeEventListener('pagehide', onPageHide)
      if (id) void liveSessionApi.end(target, id).catch(() => {})
    }
  }, [target])

  return status
}
