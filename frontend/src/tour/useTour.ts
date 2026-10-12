import { useCallback, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { authApi } from '../lib/endpoints'
import type { TourName } from '../lib/types'

/**
 * Whether a walkthrough is showing. It starts by itself the first time (once `ready`, so its
 * targets are on screen) and can be replayed with `start`. Finishing or skipping saves it to
 * the account, so it doesn't start again on this or any other device.
 */
export function useTour(name: TourName, ready: boolean) {
  const { user, setUser } = useAuth()
  const [mode, setMode] = useState<'auto' | 'open' | 'closed'>('auto')
  const seen = user === null || user.completed_tours.includes(name)
  const open = mode === 'open' || (mode === 'auto' && ready && !seen)

  const start = useCallback(() => setMode('open'), [])

  const close = useCallback(() => {
    setMode('closed')
    if (!user || user.completed_tours.includes(name)) return
    setUser({ ...user, completed_tours: [...user.completed_tours, name] })
    authApi.completeTour(name).catch(() => {
      // Not saved (e.g. offline): it shows once more next time, which is harmless.
    })
  }, [user, setUser, name])

  return { open, start, close }
}
