import { useEffect, useRef, useState } from 'react'
import { errorMessage, isStatus } from '../lib/api'
import { liveApi } from '../lib/endpoints'
import type { Scene } from '../lib/types'
import { sceneForApi, stableStringify } from '../stage/scene'

export type LiveSyncState = 'idle' | 'sending' | 'synced' | 'offline' | 'error'

const RETRY_MS = 3000

/**
 * Sends the newest picture, one request at a time. Lives outside React so it can
 * call itself again when a newer picture arrived mid-request, or retry after a
 * network failure.
 */
class SceneSender {
  latest: string | null = null
  private sent: string | null = null
  private inFlight = false
  private retryTimer: number | undefined
  private stopped = false
  private readonly setupId: number
  private readonly report: (state: LiveSyncState, error: string) => void

  constructor(setupId: number, report: (state: LiveSyncState, error: string) => void) {
    this.setupId = setupId
    this.report = report
  }

  async flush(): Promise<void> {
    if (this.stopped || this.inFlight) return
    const body = this.latest
    if (body === null || body === this.sent) return

    this.inFlight = true
    window.clearTimeout(this.retryTimer)
    this.report('sending', '')
    let retry = false
    try {
      const delivered = await liveApi.pushScene(this.setupId, JSON.parse(body) as Scene)
      this.sent = body
      if (!this.stopped) this.report(delivered ? 'synced' : 'offline', '')
    } catch (e) {
      // A refused picture (422) would be refused again; anything else is retried.
      if (isStatus(e, 422)) this.sent = body
      else retry = true
      if (!this.stopped) this.report('error', errorMessage(e, "Your live picture couldn't be updated."))
    } finally {
      this.inFlight = false
    }

    if (this.stopped) return
    if (retry) this.retryTimer = window.setTimeout(() => void this.flush(), RETRY_MS)
    else if (this.latest !== this.sent) void this.flush()
  }

  stop(): void {
    this.stopped = true
    window.clearTimeout(this.retryTimer)
  }
}

/**
 * Keeps the clean screen in step with the editor: each change is sent after a short
 * pause, always the newest picture last, so a slow network can never leave an older
 * picture on the live.
 */
export function useLiveSync(setupId: number | null, scene: Scene | null, delayMs = 120) {
  const [state, setState] = useState<LiveSyncState>('idle')
  const [error, setError] = useState('')
  const sender = useRef<SceneSender | null>(null)

  const json = scene ? stableStringify(sceneForApi(scene)) : null

  useEffect(() => {
    if (setupId === null) return
    const s = new SceneSender(setupId, (nextState, nextError) => {
      setState(nextState)
      setError(nextError)
    })
    sender.current = s
    return () => {
      s.stop()
      sender.current = null
    }
  }, [setupId])

  useEffect(() => {
    const s = sender.current
    if (!s || json === null || setupId === null) return
    s.latest = json
    const timer = window.setTimeout(() => void s.flush(), delayMs)
    return () => window.clearTimeout(timer)
  }, [json, delayMs, setupId])

  return { state, error }
}
