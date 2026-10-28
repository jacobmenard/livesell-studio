import { isAxiosError } from 'axios'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { AppPage } from '../../components/AppPage'
import { PaymentStatusBadge } from '../../components/PaymentStatus'
import { Alert, Button, Panel, Spinner } from '../../components/ui'
import { errorMessage } from '../../lib/api'
import { adminApi } from '../../lib/endpoints'
import { formatDate, formatPrice, plural } from '../../lib/format'
import type { AdminAccount, AdminAccountDetail } from '../../lib/types'
import { PLATFORMS } from '../../stage/catalog'
import { AccountStatusDialog, DeactivatedBadge, LogInAs, planSummary } from './AccountActions'

const backLink = (
  <Link to="/admin/users" className="text-sm font-semibold">
    All users
  </Link>
)

/** Superadmin: one seller account (View on the Users page). */
export function AdminUserPage() {
  const { user } = useAuth()
  if (user?.role !== 'superadmin') {
    return (
      <AppPage title="User">
        <Alert>This page is for the superadmin only.</Alert>
      </AppPage>
    )
  }
  return <UserDetail />
}

function UserDetail() {
  const id = Number(useParams().id)
  const validId = Number.isInteger(id) && id > 0
  const [account, setAccount] = useState<AdminAccountDetail | null>(null)
  const [loadError, setLoadError] = useState(validId ? '' : 'This user doesn’t exist.')

  useEffect(() => {
    if (!validId) return
    let cancelled = false
    adminApi
      .account(id)
      .then((a) => !cancelled && setAccount(a))
      .catch((e) => {
        if (cancelled) return
        setLoadError(isAxiosError(e) && e.response?.status === 404 ? 'This user doesn’t exist, or is a sub-user (see their owner’s team).' : errorMessage(e, "We couldn't load this user."))
      })
    return () => {
      cancelled = true
    }
  }, [id, validId])

  if (!account) {
    return (
      <AppPage title="User" actions={backLink}>
        {loadError ? <Alert>{loadError}</Alert> : <Spinner label="Loading user…" />}
      </AppPage>
    )
  }

  // Deactivating answers with the list row; the rest of the page stays as loaded.
  const applyRow = (row: AdminAccount) => setAccount((a) => (a ? { ...a, ...row } : a))

  return (
    <AppPage title={account.name} subtitle={account.email} actions={backLink}>
      <AccountSummary account={account} onChanged={applyRow} />
      <TeamPanel account={account} />
      <PaymentsPanel account={account} />
    </AppPage>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="m-0 text-sm">{children}</dd>
    </div>
  )
}

function AccountSummary({ account: a, onChanged }: { account: AdminAccountDetail; onChanged: (row: AdminAccount) => void }) {
  const [changingStatus, setChangingStatus] = useState(false)
  const [error, setError] = useState('')
  const platforms = PLATFORMS.filter((p) => a.platforms.includes(p.id)).map((p) => p.label)

  return (
    <Panel title="Account" headingId="account-h">
      <dl className="m-0 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
        <Fact label="Status">{a.disabled_at ? <span className="inline-flex flex-wrap items-center gap-2"><DeactivatedBadge /> since {formatDate(a.disabled_at)}</span> : 'Active'}</Fact>
        <Fact label="Plan">{planSummary(a)}</Fact>
        <Fact label="Joined">{formatDate(a.joined_at) || '—'}</Fact>
        <Fact label="Setups">{a.setups}</Fact>
        <Fact label="Stream keys saved">{platforms.length ? platforms.join(', ') : 'None'}</Fact>
      </dl>
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <LogInAs account={a} onError={setError} />
        {a.disabled_at ? (
          <Button size="sm" variant="primary" onClick={() => setChangingStatus(true)}>
            Reactivate
          </Button>
        ) : (
          <Button size="sm" variant="ghost" className="text-danger-text" onClick={() => setChangingStatus(true)}>
            Deactivate
          </Button>
        )}
      </div>
      {error && <Alert>{error}</Alert>}
      {changingStatus && <AccountStatusDialog account={a} onClose={() => setChangingStatus(false)} onChanged={onChanged} />}
    </Panel>
  )
}

function TeamPanel({ account: a }: { account: AdminAccountDetail }) {
  return (
    <Panel title="Team" subtitle={plural(a.team.length, 'sub-user')} headingId="team-h">
      {a.team.length === 0 ? (
        <p className="m-0 text-sm text-muted">No sub-users.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
          {a.team.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
              <span className="flex flex-col">
                <span className="font-semibold">{m.name}</span>
                <span className="text-[13px] text-muted">{m.email}</span>
              </span>
              <span className="text-[13px] text-text-2">
                {m.active ? 'Active' : 'Paused (no seat on the plan)'}
                {m.added_at && ` · added ${formatDate(m.added_at)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function PaymentsPanel({ account: a }: { account: AdminAccountDetail }) {
  return (
    <Panel
      title="Latest payments"
      subtitle={
        <>
          The last five. Review them on <Link to="/admin/payments">Payments</Link>.
        </>
      }
      headingId="payments-h"
    >
      {a.payments.length === 0 ? (
        <p className="m-0 text-sm text-muted">No payments yet.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
          {a.payments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
              <span className="flex flex-col">
                <span className="font-semibold">
                  {p.plan.name} · {formatPrice(p.amount, p.currency)}
                </span>
                <span className="text-[13px] text-muted">
                  Ref. {p.reference_number}
                  {p.submitted_at && ` · sent ${formatDate(p.submitted_at)}`}
                </span>
              </span>
              <PaymentStatusBadge status={p.status} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
