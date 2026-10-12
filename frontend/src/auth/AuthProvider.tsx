import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { isStatus } from '../lib/api'
import { authApi } from '../lib/endpoints'
import type { User } from '../lib/types'

type AuthState = { status: 'loading' } | { status: 'guest' } | { status: 'signed-in'; user: User }

interface AuthContextValue {
  state: AuthState
  user: User | null
  login: (email: string, password: string, remember: boolean) => Promise<User>
  register: (body: { name: string; email: string; password: string; password_confirmation: string }) => Promise<User>
  logout: () => Promise<void>
  setUser: (user: User) => void
  /** Call when the API says the session ended (401). */
  sessionEnded: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    authApi
      .me()
      .then((user) => !cancelled && setState({ status: 'signed-in', user }))
      .catch((error) => {
        if (cancelled) return
        // 401 = not signed in. Anything else: treat as signed out but let pages show their own errors.
        if (!isStatus(error, 401)) console.warn('[auth] could not check the session', error)
        setState({ status: 'guest' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string, remember: boolean) => {
    const user = await authApi.login({ email, password, remember })
    setState({ status: 'signed-in', user })
    return user
  }, [])

  const register = useCallback(async (body: { name: string; email: string; password: string; password_confirmation: string }) => {
    const user = await authApi.register(body)
    setState({ status: 'signed-in', user })
    return user
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      setState({ status: 'guest' })
    }
  }, [])

  const setUser = useCallback((user: User) => setState({ status: 'signed-in', user }), [])
  const sessionEnded = useCallback(() => setState({ status: 'guest' }), [])

  const value = useMemo<AuthContextValue>(
    () => ({ state, user: state.status === 'signed-in' ? state.user : null, login, register, logout, setUser, sessionEnded }),
    [state, login, register, logout, setUser, sessionEnded],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
