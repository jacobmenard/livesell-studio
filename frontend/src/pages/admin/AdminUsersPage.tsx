import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { AppPage } from '../../components/AppPage'
import { DataTable, type Column } from '../../components/DataTable'
import { MoreMenu } from '../../components/Menu'
import { Alert, Button, Spinner, TextField } from '../../components/ui'
import { errorMessage } from '../../lib/api'
import { adminApi } from '../../lib/endpoints'
import { formatDate, plural } from '../../lib/format'
import type { AdminAccount } from '../../lib/types'
import { AccountStatusDialog, DeactivatedBadge, LogInAs, planSummary } from './AccountActions'

/** Superadmin: the seller account owners, logging in as one of them, viewing or deactivating one. */
export function AdminUsersPage() {
  const { user } = useAuth()
  if (user?.role !== 'superadmin') {
    return (
      <AppPage title="Users">
        <Alert>This page is for the superadmin only.</Alert>
      </AppPage>
    )
  }
  return (
    <AppPage
      title="Users"
      subtitle="Seller account owners (their sub-users are under View). Log in as one to see what they see and help them; every log-in is recorded."
      actions={
        <Link to="/admin" className="text-sm font-semibold">
          Plans
        </Link>
      }
    >
      <UserList />
    </AppPage>
  )
}

function UserList() {
  const [search, setSearch] = useState('')
  // What the list shows. A new object (even with the same values) loads it again.
  const [request, setRequest] = useState<{ search: string; page: number }>({ search: '', page: 1 })
  const [rows, setRows] = useState<AdminAccount[] | null>(null)
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [error, setError] = useState('')
  // A failed "Log in as" (e.g. deactivated meanwhile), shown above the table with whose it was.
  const [actionError, setActionError] = useState('')
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
      .catch((e) => !cancelled && setError(errorMessage(e, "We couldn't load the users.")))
    return () => {
      cancelled = true
    }
  }, [request])

  const submitSearch = (e: FormEvent) => {
    e.preventDefault()
    setRequest((r) => ({ ...r, search: search.trim(), page: 1 }))
  }

  const replace = (next: AdminAccount) => setRows((all) => all?.map((a) => (a.id === next.id ? next : a)) ?? null)

  return (
    <section aria-labelledby="users-h" className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]">
      <h2 id="users-h" className="sr-only">
        Users
      </h2>
      <form role="search" onSubmit={submitSearch} className="flex items-end gap-2">
        <div className="flex-1">
          <TextField label="Search by name or email" value={search} maxLength={100} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button type="submit">Search</Button>
      </form>

      {error && <Alert>{error}</Alert>}
      {actionError && <Alert>{actionError}</Alert>}
      {rows === null && !error && <Spinner label="Loading users…" />}
      {rows?.length === 0 && <p className="m-0 text-sm text-muted">No users match.</p>}

      {rows && rows.length > 0 && <DataTable caption="Seller account owners" columns={userColumns(replace, setActionError)} rows={rows} rowKey={(a) => a.id} />}

      {meta.last_page > 1 && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="text-muted">
            Page {meta.current_page} of {meta.last_page} · {plural(meta.total, 'user')}
          </span>
          <Button size="sm" disabled={page >= meta.last_page} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </section>
  )
}

/** The Users table; a failed action is reported with whose account it was. */
function userColumns(onChanged: (account: AdminAccount) => void, onError: (message: string) => void): Column<AdminAccount>[] {
  return [
    {
      header: 'User',
      cell: (a) => (
        <span className="flex flex-col">
          <Link to={`/admin/users/${a.id}`} className="font-semibold text-text no-underline hover:underline">
            {a.name}
          </Link>
          <span className="text-[13px] break-all text-muted">{a.email}</span>
        </span>
      ),
    },
    { header: 'Plan', cell: (a) => <span className="text-text-2">{planSummary(a)}</span> },
    { header: 'Sub-users', align: 'right', cell: (a) => a.members },
    { header: 'Joined', cell: (a) => <span className="whitespace-nowrap text-text-2">{formatDate(a.joined_at) || '—'}</span> },
    { header: 'Status', cell: (a) => (a.disabled_at ? <DeactivatedBadge /> : <span className="text-text-2">Active</span>) },
    {
      header: 'Actions',
      hideHeader: true,
      align: 'right',
      cell: (a) => <UserActions account={a} onChanged={onChanged} onError={(message) => onError(message && `${a.name}: ${message}`)} />,
    },
  ]
}

/** "Log in as" and the ⋯ menu (View, Deactivate or Reactivate) for one row. */
function UserActions({ account: a, onChanged, onError }: { account: AdminAccount; onChanged: (account: AdminAccount) => void; onError: (message: string) => void }) {
  const navigate = useNavigate()
  const [changingStatus, setChangingStatus] = useState(false)

  return (
    <div className="inline-flex items-center gap-1">
      <LogInAs account={a} onError={onError} compact />
      <MoreMenu
        label={`More for ${a.name}`}
        items={[
          { label: 'View', onSelect: () => navigate(`/admin/users/${a.id}`) },
          a.disabled_at
            ? { label: 'Reactivate', onSelect: () => setChangingStatus(true) }
            : { label: 'Deactivate', danger: true, onSelect: () => setChangingStatus(true) },
        ]}
      />
      {changingStatus && <AccountStatusDialog account={a} onClose={() => setChangingStatus(false)} onChanged={onChanged} />}
    </div>
  )
}
