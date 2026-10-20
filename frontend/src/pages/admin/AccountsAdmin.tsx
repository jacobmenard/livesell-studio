import { useEffect, useState, type FormEvent } from 'react'
import { Alert, Button, Spinner, TextField } from '../../components/ui'
import { errorMessage, fieldErrors } from '../../lib/api'
import { adminApi } from '../../lib/endpoints'
import { formatDate } from '../../lib/format'
import type { AdminAccount } from '../../lib/types'

/** The seller account owners, and signing in as one of them to see what they see. */
export function AccountsAdmin() {
  const [search, setSearch] = useState('')
  // What the list shows. A new object (even with the same values) loads it again.
  const [request, setRequest] = useState<{ search: string; page: number }>({ search: '', page: 1 })
  const [rows, setRows] = useState<AdminAccount[] | null>(null)
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [error, setError] = useState('')
  const { page } = request
  const setPage = (next: number) => setRequest((r) => ({ ...r, page: next }))

  useEffect(() => {
    let cancelled = false
    adminApi
      .accounts(request)
      .then((result) => {
        if (cancelled) return
        setRows(result.data)
        setMeta(result.meta)
        setError('')
      })
      .catch((e) => !cancelled && setError(errorMessage(e, "We couldn't load the accounts.")))
    return () => {
      cancelled = true
    }
  }, [request])

  const submitSearch = (e: FormEvent) => {
    e.preventDefault()
    setRequest((r) => ({ ...r, search: search.trim(), page: 1 }))
  }

  return (
    <section aria-labelledby="accounts-h" className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]">
      <div className="flex flex-col gap-0.5">
        <h2 id="accounts-h" className="m-0 font-display text-xl font-semibold">
          Accounts
        </h2>
        <p className="m-0 text-[13px] text-muted">
          Seller account owners. <strong>Log in as</strong> opens the app as that owner, to see what they see and help them; a banner lets you go back. Every
          log-in is recorded.
        </p>
      </div>
      <form role="search" onSubmit={submitSearch} className="flex items-end gap-2">
        <div className="flex-1">
          <TextField label="Search by name or email" value={search} maxLength={100} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button type="submit">Search</Button>
      </form>

      {error && <Alert>{error}</Alert>}
      {rows === null && !error && <Spinner label="Loading accounts…" />}
      {rows?.length === 0 && <p className="m-0 text-sm text-muted">No accounts match.</p>}

      {rows && rows.length > 0 && (
        <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
          {rows.map((a) => (
            <AccountRow key={a.id} account={a} />
          ))}
        </ul>
      )}

      {meta.last_page > 1 && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="text-muted">
            Page {meta.current_page} of {meta.last_page} · {meta.total} accounts
          </span>
          <Button size="sm" disabled={page >= meta.last_page} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </section>
  )
}

function planSummary(a: AdminAccount): string {
  if (a.trial_ends_at) return `Free trial (${a.plan.name}) until ${formatDate(a.trial_ends_at)}`
  return a.ends_at ? `${a.plan.name} until ${formatDate(a.ends_at)}` : a.plan.name
}

function AccountRow({ account: a }: { account: AdminAccount }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const logInAs = async () => {
    setBusy(true)
    setError('')
    try {
      await adminApi.impersonate(a.id)
      // A full load, so nothing of the admin session stays on screen or in memory.
      window.location.assign('/setups')
    } catch (e) {
      const fields = fieldErrors(e)
      setError(fields.account ?? errorMessage(e, "We couldn't open this account."))
      setBusy(false)
      setConfirming(false)
    }
  }

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-60 flex-1 flex-col">
          <span className="font-semibold">
            {a.name} <span className="font-normal text-[13px] text-muted">{a.email}</span>
          </span>
          <span className="text-[13px] text-text-2">
            {planSummary(a)} · {a.members} sub-user{a.members === 1 ? '' : 's'}
            {a.joined_at && ` · joined ${formatDate(a.joined_at)}`}
          </span>
        </div>
        {confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-text-2">Open the app as {a.name}?</span>
            <Button size="sm" variant="primary" loading={busy} onClick={logInAs}>
              Yes, log in as them
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={() => setConfirming(true)}>
            Log in as
          </Button>
        )}
      </div>
      {error && <Alert>{error}</Alert>}
    </li>
  )
}
