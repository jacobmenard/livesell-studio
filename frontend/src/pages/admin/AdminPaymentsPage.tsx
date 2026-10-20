import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { AppPage } from '../../components/AppPage'
import { PaymentStatusBadge } from '../../components/PaymentStatus'
import { Alert, Button, Segmented, Spinner, TextField } from '../../components/ui'
import { errorMessage, fieldErrors } from '../../lib/api'
import { adminApi, paymentsApi } from '../../lib/endpoints'
import { formatDate, formatPrice } from '../../lib/format'
import type { AdminPayment, PaymentStatus } from '../../lib/types'
import { notifyPaymentsChanged } from '../../lib/pendingPayments'

type Filter = PaymentStatus | 'all'

/** Superadmin: check GCash payments against the bank account, approve or reject them. */
export function AdminPaymentsPage() {
  const { user } = useAuth()
  if (user?.role !== 'superadmin') {
    return (
      <AppPage title="Payments">
        <Alert>This page is for the superadmin only.</Alert>
      </AppPage>
    )
  }
  return (
    <AppPage
      title="Payments"
      subtitle="Check each receipt against what you received. Approving switches the plan on for a month from today."
      actions={
        <Link to="/admin" className="text-sm font-semibold">
          Accounts and plans
        </Link>
      }
    >
      <PaymentList />
    </AppPage>
  )
}

function PaymentList() {
  const [search, setSearch] = useState('')
  // What the list shows. A new object (even with the same values) loads it again.
  const [request, setRequest] = useState<{ status: Filter; search: string; page: number }>({ status: 'pending', search: '', page: 1 })
  const [rows, setRows] = useState<AdminPayment[] | null>(null)
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [error, setError] = useState('')
  const { status, page } = request
  const reload = useCallback(() => setRequest((r) => ({ ...r })), [])

  useEffect(() => {
    let cancelled = false
    adminApi
      .payments(request)
      .then((result) => {
        if (cancelled) return
        setRows(result.data)
        setMeta(result.meta)
        setError('')
      })
      .catch((e) => !cancelled && setError(errorMessage(e, "We couldn't load the payments.")))
    return () => {
      cancelled = true
    }
  }, [request])

  const submitSearch = (e: FormEvent) => {
    e.preventDefault()
    setRequest((r) => ({ ...r, search: search.trim(), page: 1 }))
  }

  const reviewed = () => {
    notifyPaymentsChanged()
    reload()
  }

  return (
    <section aria-labelledby="payments-h" className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="payments-h" className="m-0 font-display text-xl font-semibold">
          {status === 'pending' ? 'Waiting for review' : 'Payments'}
          {status === 'pending' && meta.total > 0 && <span className="text-muted"> · {meta.total}</span>}
        </h2>
        <Segmented
          label="Show"
          size="sm"
          value={status}
          onChange={(s) => setRequest((r) => ({ ...r, status: s, page: 1 }))}
          options={[
            { id: 'pending', label: 'Pending' },
            { id: 'approved', label: 'Approved' },
            { id: 'rejected', label: 'Rejected' },
            { id: 'all', label: 'All' },
          ]}
        />
      </div>
      <form role="search" onSubmit={submitSearch} className="flex items-end gap-2">
        <div className="flex-1">
          <TextField label="Search by name, email or reference" value={search} maxLength={100} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button type="submit">Search</Button>
      </form>

      {error && <Alert>{error}</Alert>}
      {rows === null && !error && <Spinner label="Loading payments…" />}
      {rows?.length === 0 && <p className="m-0 text-sm text-muted">{status === 'pending' ? 'No payments waiting. You’re all caught up.' : 'No payments match.'}</p>}

      {rows && rows.length > 0 && (
        <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
          {rows.map((p) => (
            <PaymentRow key={p.id} payment={p} onReviewed={reviewed} />
          ))}
        </ul>
      )}

      {meta.last_page > 1 && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <Button size="sm" disabled={page <= 1} onClick={() => setRequest((r) => ({ ...r, page: page - 1 }))}>
            Previous
          </Button>
          <span className="text-muted">
            Page {meta.current_page} of {meta.last_page} · {meta.total} payments
          </span>
          <Button size="sm" disabled={page >= meta.last_page} onClick={() => setRequest((r) => ({ ...r, page: page + 1 }))}>
            Next
          </Button>
        </div>
      )}
    </section>
  )
}

function PaymentRow({ payment: p, onReviewed }: { payment: AdminPayment; onReviewed: () => void }) {
  const [mode, setMode] = useState<'idle' | 'approve' | 'reject'>('idle')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const act = async (action: () => Promise<unknown>, failure: string) => {
    setBusy(true)
    setError('')
    try {
      await action()
      onReviewed()
    } catch (e) {
      const fields = fieldErrors(e)
      setError(fields.reason ?? fields.payment ?? errorMessage(e, failure))
      setBusy(false)
    }
  }

  return (
    <li className="flex flex-wrap gap-4 py-4">
      <ProofThumb paymentId={p.id} />
      <div className="flex min-w-60 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-semibold">{p.account.name}</span>
          <span className="text-[13px] text-muted">{p.account.email}</span>
          <span className="flex-1" />
          <PaymentStatusBadge status={p.status} />
        </div>
        <p className="m-0 text-sm">
          <strong>{formatPrice(p.amount, p.currency)}</strong> for {p.plan.name} · ref <span className="font-semibold select-all">{p.reference_number}</span>
        </p>
        <p className="m-0 text-[13px] text-muted">
          Sent {formatDate(p.submitted_at)}
          {p.submitted_by && p.submitted_by !== p.account.name && ` by ${p.submitted_by}`}
          {p.reviewed_at && ` · ${p.status === 'approved' ? 'approved' : 'rejected'} ${formatDate(p.reviewed_at)}${p.reviewed_by ? ` by ${p.reviewed_by}` : ''}`}
          {p.status === 'approved' && p.period_start && ` · plan ${formatDate(p.period_start)} – ${formatDate(p.period_end)}`}
        </p>
        {p.status === 'rejected' && p.review_note && <p className="m-0 text-[13px] text-danger-text">Reason: {p.review_note}</p>}

        {p.status === 'pending' && mode === 'idle' && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="primary" onClick={() => setMode('approve')}>
              Approve
            </Button>
            <Button size="sm" onClick={() => setMode('reject')}>
              Reject
            </Button>
          </div>
        )}
        {p.status === 'pending' && mode === 'approve' && (
          <div className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-2 p-3">
            <p className="m-0 text-[13px] text-text-2">
              Did {formatPrice(p.amount, p.currency)} with reference {p.reference_number} reach the bank account? Approving switches {p.account.name} to {p.plan.name}.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" loading={busy} onClick={() => act(() => adminApi.approvePayment(p.id), "We couldn't approve the payment.")}>
                Yes, approve
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setMode('idle')}>
                Back
              </Button>
            </div>
          </div>
        )}
        {p.status === 'pending' && mode === 'reject' && (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              if (reason.trim().length < 3) {
                setError('Tell the seller why, so they can fix it.')
                return
              }
              void act(() => adminApi.rejectPayment(p.id, reason.trim()), "We couldn't reject the payment.")
            }}
            className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-2 p-3"
          >
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Reason (the seller sees this)
              <textarea
                value={reason}
                maxLength={500}
                rows={2}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. No transfer with this reference reached the account."
                className="rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 font-normal text-text placeholder:text-muted"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="danger" type="submit" loading={busy}>
                Reject payment
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setMode('idle')}>
                Back
              </Button>
            </div>
          </form>
        )}
        {error && <Alert>{error}</Alert>}
      </div>
    </li>
  )
}

/** The receipt, fetched with the session (it's private); click to see it full size. */
function ProofThumb({ paymentId }: { paymentId: number }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    paymentsApi
      .proof(paymentId)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [paymentId])

  const box = 'grid h-40 w-28 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-surface-2 text-center text-xs text-muted'
  if (failed) return <span className={box}>Receipt unavailable</span>
  if (!url) return <span className={box}>Loading…</span>
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={box} aria-label="Open the receipt full size">
      <img src={url} alt="Payment receipt" className="h-full w-full object-cover object-top" />
    </a>
  )
}
