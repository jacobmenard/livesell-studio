import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { AppPage } from '../../components/AppPage'
import { Alert, Button, TextField } from '../../components/ui'
import { errorMessage, fieldErrors } from '../../lib/api'
import { adminApi } from '../../lib/endpoints'
import type { Plan } from '../../lib/types'
import { AccountsAdmin } from './AccountsAdmin'

/**
 * Superadmin: seller accounts (and logging in as one), and what each plan costs and allows
 * (payments, which switch plans on, are on /admin/payments).
 */
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
      subtitle="Seller accounts (log in as one to help them), and what each plan costs and allows. Plans switch on when you approve a payment."
      actions={
        <Link to="/admin/payments" className="text-sm font-semibold">
          Review payments
        </Link>
      }
    >
      <AccountsAdmin />
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
