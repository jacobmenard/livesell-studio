import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { errorMessage } from '../lib/api'
import { authApi } from '../lib/endpoints'

/** While the superadmin is signed in as an owner: whose account this is, and the way back. */
export function ImpersonationBanner() {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!user?.impersonated_by) return null

  const goBack = async () => {
    setBusy(true)
    setError('')
    try {
      await authApi.stopImpersonating()
      window.location.assign('/admin')
    } catch (e) {
      // The admin session may be gone (e.g. their role changed): sign in again.
      setError(errorMessage(e, "We couldn't switch back."))
      setBusy(false)
    }
  }

  return (
    <div role="status" className="sticky top-0 z-40 bg-promo text-ink">
      <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-x-4 gap-y-2 px-[clamp(16px,3vw,32px)] py-2 text-sm">
        <span className="flex-1">
          You’re signed in as <strong>{user.name}</strong> ({user.email}), {user.impersonated_by}. Anything you change is saved to their account.
        </span>
        {error && <span className="font-semibold">{error}</span>}
        <button
          type="button"
          onClick={goBack}
          disabled={busy}
          className="inline-flex min-h-9 items-center rounded-full border-0 bg-ink px-4 font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {busy ? 'Switching back…' : 'Back to admin'}
        </button>
      </div>
    </div>
  )
}
