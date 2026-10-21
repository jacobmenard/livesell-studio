import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError } from '@/api/client'
import { liveApi } from '@/api/endpoints'

/**
 * The plan's "setups live at once" slot for this phone's live. Claimed before streaming
 * starts (so a plan without room says so up front), kept with a heartbeat, given back when
 * the live ends. The stream itself never goes through the server.
 */
export type SessionState =
  | { kind: 'idle' }
  | { kind: 'claiming' }
  | { kind: 'held'; id: string }
  | { kind: 'refused'; message: string }
  | { kind: 'ended' }

export function useLiveSession(setupId: number) {
  const [state, setState] = useState<SessionState>({ kind: 'idle' })
  const sessionId = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  /** Heartbeats that failed in a row; a weak signal shouldn't end the live, the server just marks it stale. */
  const [missedBeats, setMissedBeats] = useState(0)

  const stopTimer = () => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
  }

  const claim = useCallback(async (): Promise<boolean> => {
    if (sessionId.current) return true
    setState({ kind: 'claiming' })
    try {
      const ticket = await liveApi.start(setupId)
      sessionId.current = ticket.id
      setState({ kind: 'held', id: ticket.id })
      const every = Math.max(10, ticket.heartbeat_seconds) * 1000
      stopTimer()
      timer.current = setInterval(() => {
        const id = sessionId.current
        if (!id) return
        liveApi
          .beat(id)
          .then(() => setMissedBeats(0))
          .catch((error: unknown) => {
            // 409: another live took the plan's slot while this one looked stale.
            if (error instanceof ApiError && error.status === 409) setState({ kind: 'refused', message: error.message })
            setMissedBeats((n) => n + 1)
          })
      }, every)
      return true
    } catch (error) {
      setState({ kind: 'refused', message: error instanceof ApiError ? error.message : 'Going live is not possible right now.' })
      return false
    }
  }, [setupId])

  const release = useCallback(async () => {
    stopTimer()
    const id = sessionId.current
    sessionId.current = null
    setState({ kind: 'ended' })
    if (id) await liveApi.end(id).catch(() => {})
  }, [])

  // Leaving the screen any way at all gives the slot back.
  useEffect(
    () => () => {
      stopTimer()
      const id = sessionId.current
      sessionId.current = null
      if (id) void liveApi.end(id).catch(() => {})
    },
    [],
  )

  return { state, claim, release, missedBeats }
}
