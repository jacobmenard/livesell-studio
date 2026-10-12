import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { authApi } from '../lib/endpoints'
import { readLocal, writeLocal } from '../lib/storage'
import type { ThemePref } from '../lib/types'

const KEY = 'livesell.theme'

interface ThemeContextValue {
  pref: ThemePref
  setPref: (pref: ThemePref) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readPref(): ThemePref {
  const saved = readLocal(KEY)
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'
}

function apply(pref: ThemePref) {
  const root = document.documentElement
  if (pref === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', pref)
}

/**
 * Light / Dark / Auto. Remembered on this device (applied before first paint by
 * index.html) and saved to the account so it follows the seller to other devices.
 * Only the app around the video changes; the stage never uses theme colors.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [pref, setPrefState] = useState<ThemePref>(readPref)

  useEffect(() => {
    apply(pref)
    writeLocal(KEY, pref)
  }, [pref])

  // When the seller signs in, their account's choice wins (adjusted during render,
  // the React-recommended way to follow a changing input).
  const accountTheme = user?.theme ?? null
  const [seenAccountTheme, setSeenAccountTheme] = useState<ThemePref | null>(null)
  if (accountTheme !== seenAccountTheme) {
    setSeenAccountTheme(accountTheme)
    if (accountTheme) setPrefState(accountTheme)
  }

  const signedIn = user !== null
  const setPref = useCallback(
    (next: ThemePref) => {
      setPrefState(next)
      if (signedIn) {
        authApi.saveTheme(next).catch(() => {
          // Still applied and remembered on this device; the account copy updates next time.
        })
      }
    },
    [signedIn],
  )

  const value = useMemo(() => ({ pref, setPref }), [pref, setPref])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
