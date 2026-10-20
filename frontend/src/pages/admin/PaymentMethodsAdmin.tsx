import { useEffect, useState, type FormEvent } from 'react'
import { Alert, Button, Segmented, Spinner, Switch, TextField } from '../../components/ui'
import { errorMessage, fieldErrors } from '../../lib/api'
import { adminApi } from '../../lib/endpoints'
import type { PaymentMethod, PaymentMethodInput, PaymentMethodType } from '../../lib/types'

const TYPES: { id: PaymentMethodType; label: string }[] = [
  { id: 'gcash', label: 'GCash' },
  { id: 'maya', label: 'Maya' },
  { id: 'bank', label: 'Bank' },
]

const typeName = (type: PaymentMethodType) => TYPES.find((t) => t.id === type)?.label ?? type

const inputOf = (m: PaymentMethod): PaymentMethodInput => ({
  type: m.type,
  label: m.label ?? '',
  account_name: m.account_name,
  account_number: m.account_number,
  instructions: m.instructions ?? '',
  enabled: m.enabled,
})

/** The GCash, Maya and bank accounts sellers can pay into; they pick one in the pay dialog. */
export function PaymentMethodsAdmin() {
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [editing, setEditing] = useState<number | 'new' | null>(null)

  const load = () =>
    adminApi
      .paymentMethods()
      .then(setMethods)
      .catch((e) => setLoadError(errorMessage(e, "We couldn't load the payment methods.")))

  useEffect(() => {
    let cancelled = false
    adminApi
      .paymentMethods()
      .then((m) => !cancelled && setMethods(m))
      .catch((e) => !cancelled && setLoadError(errorMessage(e, "We couldn't load the payment methods.")))
    return () => {
      cancelled = true
    }
  }, [])

  const saved = () => {
    setEditing(null)
    void load()
  }

  return (
    <section aria-labelledby="pay-methods-h" className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]">
      <div className="flex flex-col gap-0.5">
        <h2 id="pay-methods-h" className="m-0 font-display text-xl font-semibold">
          Payment methods
        </h2>
        <p className="m-0 text-[13px] text-muted">
          Sellers choose one of these, send the plan’s price to it, then send you the receipt. Turned-off methods are hidden from sellers. Plans can’t be paid for until
          at least one is on.
        </p>
      </div>
      {loadError && <Alert>{loadError}</Alert>}
      {!methods && !loadError && <Spinner label="Loading…" />}

      {methods && (
        <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
          {methods.length === 0 && <li className="py-3 text-sm text-muted">No payment methods yet. Add your GCash, Maya or bank account below.</li>}
          {methods.map((m) =>
            editing === m.id ? (
              <li key={m.id} className="py-3">
                <MethodForm method={m} onSaved={saved} onCancel={() => setEditing(null)} />
              </li>
            ) : (
              <MethodRow key={m.id} method={m} onEdit={() => setEditing(m.id)} onChanged={saved} />
            ),
          )}
        </ul>
      )}

      {methods &&
        (editing === 'new' ? (
          <MethodForm method={null} onSaved={saved} onCancel={() => setEditing(null)} />
        ) : (
          <div>
            <Button variant="primary" onClick={() => setEditing('new')}>
              Add payment method
            </Button>
          </div>
        ))}
    </section>
  )
}

function MethodRow({ method: m, onEdit, onChanged }: { method: PaymentMethod; onEdit: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')

  const run = async (action: () => Promise<unknown>, failure: string) => {
    setBusy(true)
    setError('')
    try {
      await action()
      onChanged()
    } catch (e) {
      setError(errorMessage(e, failure))
      setBusy(false)
    }
  }

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-48 flex-1 flex-col">
          <span className="font-semibold">
            {m.name}
            {m.type !== 'bank' && m.name !== typeName(m.type) && <span className="font-normal text-muted"> · {typeName(m.type)}</span>}
            {m.type === 'bank' && <span className="font-normal text-muted"> · Bank</span>}
          </span>
          <span className="text-[13px] text-text-2">
            {m.account_number} · {m.account_name}
          </span>
        </div>
        <Switch
          checked={m.enabled}
          disabled={busy}
          label={m.enabled ? 'On' : 'Off'}
          onChange={(enabled) => run(() => adminApi.updatePaymentMethod(m.id, { ...inputOf(m), enabled }), "We couldn't update the payment method.")}
        />
        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={onEdit}>
            Edit
          </Button>
          {confirmDelete ? (
            <Button size="sm" variant="danger" loading={busy} onClick={() => run(() => adminApi.deletePaymentMethod(m.id), "We couldn't delete the payment method.")}>
              Confirm delete
            </Button>
          ) : (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          )}
        </div>
      </div>
      {error && <Alert>{error}</Alert>}
    </li>
  )
}

function MethodForm({ method, onSaved, onCancel }: { method: PaymentMethod | null; onSaved: () => void; onCancel: () => void }) {
  const [form, setForm] = useState<PaymentMethodInput>(
    method ? inputOf(method) : { type: 'gcash', label: '', account_name: '', account_number: '', instructions: '', enabled: true },
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const bank = form.type === 'bank'

  const set = <K extends keyof PaymentMethodInput>(key: K, value: PaymentMethodInput[K]) => setForm((f) => ({ ...f, [key]: value }))

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    try {
      if (method) await adminApi.updatePaymentMethod(method.id, form)
      else await adminApi.createPaymentMethod(form)
      onSaved()
    } catch (err) {
      const fields = fieldErrors(err)
      setErrors(Object.keys(fields).length ? fields : { form: errorMessage(err, "We couldn't save the payment method.") })
      setBusy(false)
    }
  }

  return (
    <form noValidate onSubmit={save} className="flex flex-col gap-3 rounded-xl border border-line-strong bg-surface-2 p-3">
      <Segmented label="Type" options={TYPES} value={form.type} onChange={(type) => set('type', type)} />
      {errors.type && <p className="m-0 text-[13px] text-danger-text">{errors.type}</p>}
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <TextField
          label={bank ? 'Bank name' : 'Name shown to sellers (optional)'}
          value={form.label}
          maxLength={60}
          placeholder={bank ? 'e.g. Metrobank' : typeName(form.type)}
          error={errors.label}
          onChange={(e) => set('label', e.target.value)}
        />
        <TextField label="Account name" value={form.account_name} maxLength={80} error={errors.account_name} onChange={(e) => set('account_name', e.target.value)} />
        <TextField
          label={bank ? 'Account number' : `${typeName(form.type)} number`}
          value={form.account_number}
          maxLength={34}
          inputMode="tel"
          placeholder={bank ? '' : 'e.g. 0917 123 4567'}
          error={errors.account_number}
          onChange={(e) => set('account_number', e.target.value)}
        />
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Instructions for sellers (optional)
        <textarea
          value={form.instructions}
          maxLength={500}
          rows={2}
          onChange={(e) => set('instructions', e.target.value)}
          className="rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 font-normal text-text"
        />
        {errors.instructions && <span className="text-[13px] font-normal text-danger-text">{errors.instructions}</span>}
      </label>
      {errors.form && <Alert>{errors.form}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" loading={busy}>
          {method ? 'Save changes' : 'Add payment method'}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
