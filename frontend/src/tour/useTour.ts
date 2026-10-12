import { useCallback, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { authApi } from '../lib/endpoints'
import type { TourName } from '../lib/types'

/**
 * Whether a walkthrough is showing. Until the seller ticks "Don't show this again" it starts
 * by itself on each visit (once `ready`, so its targets are on screen); ticking it saves that
 * to the account, so it stays away on every device. `start` replays it anytime.
 */
export function useTour(name: TourName, ready: boolean) {
  const { user, setUser } = useAuth()
  const [mode, setMode] = useState<'auto' | 'open' | 'closed'>('auto')
  const seen = user === null || user.completed_tours.includes(name)
  const open = mode === 'open' || (mode === 'auto' && ready && !seen)

  const start = useCallback(() => setMode('open'), [])

  const close = useCallback(
    (dontShowAgain: boolean) => {
      setMode('closed')
      if (!dontShowAgain || !user || user.completed_tours.includes(name)) return
      setUser({ ...user, completed_tours: [...user.completed_tours, name] })
      authApi.completeTour(name).catch(() => {
        // Not saved (e.g. offline): it shows once more next time, which is harmless.
      })
    },
    [user, setUser, name],
  )

  /** The box is offered only while the tour still starts by itself. */
  return { open, start, close, offerDontShowAgain: !seen }
}
