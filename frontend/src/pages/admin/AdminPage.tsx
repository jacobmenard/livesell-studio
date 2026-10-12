import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { AppPage } from '../../components/AppPage'
import { Alert, Button, Spinner, TextField } from '../../components/ui'
import { errorMessage, fieldErrors } from '../../lib/api'
import { adminApi } from '../../lib/endpoints'
import { formatDate } from '../../lib/format'
import type { AdminAccount, Plan } from '../../lib/types'

/** Superadmin: change an account's plan by hand, edit prices and limits (payments are on /admin/payments). */
export function AdminPage() {
  const { user } = useAuth()
  if (user?.role !== 'superadmin') {
    return (
      <AppPage title="Admin">
        <Alert>This page is for the superadmin only.</Alert>
      </AppPage>
    )
  }
  return <AdminScreens />
}

function AdminScreens() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [plansError, setPlansError] = useState('')

  useEffect(() => {
    let cancelled = false
    adminApi
      .plans()
      .then((p) => !cancelled && setPlans(p))
      .catch((e) => !cancelled && setPlansError(errorMessage(e, "We couldn't load the plans.")))
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <AppPage
      title="Admin"
      subtitle="Set an account’s plan by hand, and what each plan costs and allows."
      actions={
        <Link to="/admin/payments" className="text-sm font-semibold">
          Review payments
        </Link>
      }
    >
      <Accounts plans={plans} />
      <section aria-labelledby="plans-h" className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]">
        <h2 id="plans-h" className="m-0 font-display text-xl font-semibold">
          Plans
        </h2>
        {plansError && <Alert>{plansError}</Alert>}
        {plans.map((p) => (
          <PlanEditor key={p.id} plan={p} onSaved={(next) => setPlans((all) => all.map((x) => (x.id === next.id ? next : x)))} />
        ))}
      </section>
    </AppPage>
  )
}

function Accounts({ plans }: { plans: Plan[] }) {
  const [search, setSearch] = useState('')
  // What the list shows. A new object (even with the same values) loads it again.
  const [request, setRequest] = useState<{ search: string; page: number }>({ search: '', page: 1 })
  const [rows, setRows] = useState<AdminAccount[] | null>(null)
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [error, setError] = useState('')
  const { page } = request
  // After changing a plan.
  const reload = useCallback(() => setRequest((r) => ({ ...r })), [])
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
      <h2 id="accounts-h" className="m-0 font-display text-xl font-semibold">
        Accounts
      </h2>
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
            <AccountRow key={a.id} account={a} plans={plans} onChanged={reload} />
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

function AccountRow({ account, plans, onChanged }: { account: AdminAccount; plans: Plan[]; onChanged: () => void }) {
  const [plan, setPlan] = useState(account.plan.code)
  const [endsAt, setEndsAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // The earliest end date the date picker offers (fixed when the row appears).
  const [today] = useState(() => new Date().toISOString().slice(0, 10))

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      await adminApi.setPlan(account.id, { plan, ends_at: endsAt || null })
      onChanged()
    } catch (e) {
      const fields = fieldErrors(e)
      setError(fields.ends_at ?? fields.plan ?? errorMessage(e, "We couldn't change the plan."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-semibold">{account.name}</span>
        <span className="text-[13px] text-muted">{account.email}</span>
        {account.role === 'superadmin' && <span className="rounded-full bg-raised px-2 py-0.5 text-xs font-semibold">Superadmin</span>}
        <span className="flex-1" />
        <span className="text-[13px] text-text-2">
          {account.plan.name}
          {account.ends_at && ` until ${formatDate(account.ends_at)}`} · {account.members} sub-user{account.members === 1 ? '' : 's'}
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[13px] text-muted">
          Plan
          <select value={plan} onChange={(e) => setPlan(e.target.value)} className="min-h-10 rounded-xl border border-line-strong bg-field px-2.5 text-text">
            {plans.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-muted">
          Until (optional)
          <input type="date" min={today} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="min-h-10 rounded-xl border border-line-strong bg-field px-2.5 text-text" />
        </label>
        <Button size="sm" variant="primary" onClick={save} loading={busy}>
          Save plan
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
    </li>
  )
}

function PlanEditor({ plan, onSaved }: { plan: Plan; onSaved: (plan: Plan) => void }) {
  const [form, setForm] = useState({ name: plan.name, price_monthly: String(plan.price_monthly), max_subusers: String(plan.max_subusers), max_live_setups: String(plan.max_live_setups) })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    setSaved(false)
    try {
      const next = await adminApi.updatePlan(plan.id, {
        name: form.name.trim(),
        price_monthly: Number(form.price_monthly),
        max_subusers: Number(form.max_subusers),
        max_live_setups: Number(form.max_live_setups),
      })
      onSaved(next)
      setSaved(true)
    } catch (err) {
      const fields = fieldErrors(err)
      setErrors(Object.keys(fields).length ? fields : { name: errorMessage(err, "We couldn't save the plan.") })
    } finally {
      setBusy(false)
    }
  }

  const field = (key: keyof typeof form, label: string, type: 'text' | 'number', min?: number) => (
    <TextField
      label={label}
      type={type}
      inputMode={type === 'number' ? 'numeric' : undefined}
      min={min}
      value={form[key]}
      error={errors[key]}
      onChange={(e) => {
        setSaved(false)
        setForm((f) => ({ ...f, [key]: e.target.value }))
      }}
    />
  )

  return (
    <form noValidate onSubmit={save} className="grid items-end gap-2 border-t border-line pt-3 [grid-template-columns:repeat(auto-fit,minmax(130px,1fr))]">
      {field('name', `Name (${plan.code})`, 'text')}
      {field('price_monthly', `Price / month (${plan.currency})`, 'number', 0)}
      {field('max_subusers', 'Sub-users', 'number', 0)}
      {field('max_live_setups', 'Setups live at once', 'number', 1)}
      <Button type="submit" loading={busy}>
        {saved ? 'Saved' : 'Save'}
      </Button>
    </form>
  )
}
