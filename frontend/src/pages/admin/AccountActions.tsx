import { useEffect, useRef, useState } from 'react'
import { Alert, Button } from '../../components/ui'
import { errorMessage, fieldErrors } from '../../lib/api'
import { adminApi } from '../../lib/endpoints'
import { formatDate, plural } from '../../lib/format'
import type { AdminAccount } from '../../lib/types'

// What the Users list and one user's page share: plan line, status, "Log in as", deactivating.

export function planSummary(a: AdminAccount): string {
  if (a.trial_ends_at) return `Free trial (${a.plan.name}) until ${formatDate(a.trial_ends_at)}`
  return a.ends_at ? `${a.plan.name} until ${formatDate(a.ends_at)}` : a.plan.name
}

export function DeactivatedBadge() {
  return <span className="inline-flex shrink-0 items-center rounded-full bg-danger-bg px-2.5 py-0.5 text-xs font-semibold text-danger-text">Deactivated</span>
}

/** "Log in as", confirmed in place (a deactivated account has to be reactivated first). */
export function LogInAs({ account: a, onError }: { account: AdminAccount; onError: (message: string) => void }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const logInAs = async () => {
    setBusy(true)
    onError('')
    try {
      await adminApi.impersonate(a.id)
      // A full load, so nothing of the admin session stays on screen or in memory.
      window.location.assign('/setups')
    } catch (e) {
      onError(fieldErrors(e).account ?? errorMessage(e, "We couldn't open this account."))
      setBusy(false)
      setConfirming(false)
    }
  }

  if (confirming) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-text-2">Open the app as {a.name}?</span>
        <Button size="sm" variant="primary" loading={busy} onClick={logInAs}>
          Yes, log in as them
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    )
  }
  return (
    <Button size="sm" disabled={a.disabled_at !== null} title={a.disabled_at ? 'Reactivate the account first' : undefined} onClick={() => setConfirming(true)}>
      Log in as
    </Button>
  )
}

/** Asks before deactivating (or reactivating) an account, then reports the account as it is now. */
export function AccountStatusDialog({ account: a, onClose, onChanged }: { account: AdminAccount; onClose: () => void; onChanged: (account: AdminAccount) => void }) {
  const deactivating = a.disabled_at === null
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const cancel = useRef<HTMLButtonElement>(null)

  // Focus starts on Cancel (the safe choice) and goes back where it was once the dialog closes.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    cancel.current?.focus()
    return () => before?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const confirm = async () => {
    setBusy(true)
    setError('')
    try {
      onChanged(await (deactivating ? adminApi.deactivateAccount(a.id) : adminApi.reactivateAccount(a.id)))
      onClose()
    } catch (e) {
      setError(errorMessage(e, deactivating ? "We couldn't deactivate this account." : "We couldn't reactivate this account."))
      setBusy(false)
    }
  }

  const team = a.members > 0 ? ` and ${plural(a.members, 'sub-user')}` : ''

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="account-status-h" className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-[20px] border border-line bg-surface p-6">
        <h2 id="account-status-h" className="m-0 font-display text-xl font-semibold">
          {deactivating ? `Deactivate ${a.name}?` : `Reactivate ${a.name}?`}
        </h2>
        <p className="m-0 text-sm text-text-2">
          {deactivating
            ? `${a.name}${team} will be signed out on every device and can’t log in. Their clean-screen links stop working. Nothing is deleted, and you can reactivate the account any time.`
            : `${a.name}${team} can log in again, and their clean-screen links work again.`}
        </p>
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button ref={cancel} variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant={deactivating ? 'danger' : 'primary'} loading={busy} onClick={confirm}>
            {deactivating ? 'Deactivate' : 'Reactivate'}
          </Button>
        </div>
      </div>
    </div>
  )
}
