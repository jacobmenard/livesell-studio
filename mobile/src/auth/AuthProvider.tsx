import { useQueryClient } from '@tanstack/react-query'
import * as Device from 'expo-device'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { ApiError, configureApi } from '@/api/client'
import { authApi } from '@/api/endpoints'
import type { MobileSession, User } from '@/api/types'
import { clearToken, readToken, writeToken } from './tokenStore'

type Status = 'loading' | 'signedOut' | 'signedIn'

interface AuthState {
  status: Status
  user: User | null
  login: (email: string, password: string) => Promise<void>
  register: (input: { name: string; email: string; password: string }) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

/** How the phone is named in the seller's signed-in devices. */
function deviceName(): string {
  const name = [Device.manufacturer, Device.modelName].filter(Boolean).join(' ').trim()
  return (name || 'Android phone').slice(0, 80)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<Status>('loading')
  const [user, setUser] = useState<User | null>(null)
  const token = useRef<string | null>(null)

  const signOutLocally = useCallback(async () => {
    token.current = null
    await clearToken()
    queryClient.clear()
    setUser(null)
    setStatus('signedOut')
  }, [queryClient])

  useEffect(() => {
    configureApi({
      getToken: () => token.current,
      // The server no longer accepts this token (logged out elsewhere, password changed, paused).
      onUnauthorized: () => void signOutLocally(),
    })
  }, [signOutLocally])

  // On launch: reuse the saved token if the server still accepts it.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const saved = await readToken()
      if (!saved) {
        if (!cancelled) setStatus('signedOut')
        return
      }
      token.current = saved
      try {
        const me = await authApi.me()
        if (cancelled) return
        setUser(me)
        setStatus('signedIn')
      } catch (error) {
        if (cancelled) return
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          await signOutLocally()
        } else {
          // Offline at launch: stay signed in with what we know; screens show their own retry.
          setStatus('signedIn')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [signOutLocally])

  const accept = useCallback(async (session: MobileSession) => {
    await writeToken(session.token)
    token.current = session.token
    setUser(session.user)
    setStatus('signedIn')
  }, [])

  const login = useCallback(
    async (email: string, password: string) => {
      await accept(await authApi.login({ email: email.trim(), password, device_name: deviceName() }))
    },
    [accept],
  )

  const register = useCallback(
    async (input: { name: string; email: string; password: string }) => {
      await accept(
        await authApi.register({
          name: input.name.trim(),
          email: input.email.trim(),
          password: input.password,
          password_confirmation: input.password,
          device_name: deviceName(),
        }),
      )
    },
    [accept],
  )

  const logout = useCallback(async () => {
    // Turn the token off on the server too; sign out on the phone even if that fails.
    await authApi.logout().catch(() => {})
    await signOutLocally()
  }, [signOutLocally])

  const value = useMemo<AuthState>(() => ({ status, user, login, register, logout }), [status, user, login, register, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
