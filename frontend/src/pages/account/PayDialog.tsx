import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { Alert, Button, TextField, UploadTile, cx } from '../../components/ui'
import { errorMessage, fieldErrors } from '../../lib/api'
import { paymentsApi } from '../../lib/endpoints'
import { formatPrice } from '../../lib/format'
import type { Payment, PaymentMethod, Plan } from '../../lib/types'

const PROOF_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_PROOF_BYTES = 5 * 1024 * 1024
const TYPE_NAMES: Record<PaymentMethod['type'], string> = { gcash: 'GCash', maya: 'Maya', bank: 'Bank transfer' }

/**
 * Paying for a plan by hand: choose one of the superadmin's payment methods (GCash, Maya or
 * a bank), send the exact amount to it, then give the reference number and a screenshot of
 * the receipt. The superadmin checks it; the plan starts once it's approved.
 */
export function PayDialog({
  plan,
  methods,
  title,
  note,
  onClose,
  onPaid,
}: {
  plan: Plan
  /** The enabled payment methods (at least one). */
  methods: PaymentMethod[]
  title: string
  /** What happens once it's approved (when the month starts, sub-users paused...). */
  note: ReactNode
  onClose: () => void
  onPaid: (payment: Payment) => void
}) {
  const [methodId, setMethodId] = useState<number | null>(null)
  const method = methods.find((m) => m.id === methodId) ?? null
  const [reference, setReference] = useState('')
  const [proof, setProof] = useState<{ file: File; url: string } | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const previewUrl = useRef<string | null>(null)
  const amount = formatPrice(plan.price_monthly, plan.currency)

  // Free the receipt preview when the dialog closes.
  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    },
    [],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const pickProof = (file: File) => {
    if (!PROOF_TYPES.includes(file.type)) {
      setErrors((e) => ({ ...e, proof: 'Use a PNG, JPG or WEBP screenshot of the receipt.' }))
      return
    }
    if (file.size > MAX_PROOF_BYTES) {
      setErrors((e) => ({ ...e, proof: 'The screenshot must be 5 MB or smaller.' }))
      return
    }
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    const url = URL.createObjectURL(file)
    previewUrl.current = url
    setProof({ file, url })
    setErrors(({ proof: _drop, ...rest }) => rest)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!method) next.payment_method = 'Choose how you’ll pay.'
    else {
      if (reference.replace(/[\s-]/g, '').length < 6) next.reference_number = 'Enter the reference number from your receipt.'
      if (!proof) next.proof = 'Attach a screenshot of your receipt.'
    }
    setErrors(next)
    if (Object.keys(next).length > 0 || !proof || !method) return

    setBusy(true)
    try {
      onPaid(await paymentsApi.submit({ plan: plan.code, payment_method: method.id, reference_number: reference, proof: proof.file }))
    } catch (err) {
      const fields = fieldErrors(err)
      setErrors(Object.keys(fields).length ? { ...fields, form: fields.plan ?? '' } : { form: errorMessage(err, "We couldn't send your payment details.") })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="pay-h" className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <form noValidate onSubmit={submit} className="flex max-h-[calc(100dvh-32px)] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-[20px] border border-line bg-surface p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex flex-1 flex-col gap-0.5">
            <h2 id="pay-h" className="m-0 font-display text-xl font-semibold">
              {title}
            </h2>
            <p className="m-0 text-sm text-text-2">
              {plan.name} · <strong className="text-text">{amount}</strong> for one month
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line-strong bg-transparent text-text disabled:opacity-60">
            <Icon name="close" size={16} />
          </button>
        </div>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-sm font-semibold">1. Choose how you’ll pay</legend>
          <div role="radiogroup" aria-label="Payment method" className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
            {methods.map((m) => {
              const on = m.id === methodId
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    setMethodId(m.id)
                    setErrors(({ payment_method: _drop, ...rest }) => rest)
                  }}
                  className={cx('flex min-h-14 items-center gap-3 rounded-[14px] border-2 bg-field px-3.5 py-2.5 text-left text-text', on ? 'border-select' : 'border-line')}
                >
                  <span className={cx('grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-2', on ? 'border-select' : 'border-line')}>
                    <span className={cx('h-2 w-2 rounded-full', on ? 'bg-select' : 'bg-transparent')} />
                  </span>
                  <span className="flex flex-1 flex-col leading-tight">
                    <span className="font-semibold">{m.name}</span>
                    <span className="text-[13px] text-muted">{TYPE_NAMES[m.type]}</span>
                  </span>
                </button>
              )
            })}
          </div>
          {errors.payment_method && <p className="m-0 text-[13px] text-danger-text">{errors.payment_method}</p>}
        </fieldset>

        {method && (
          <>
            <div className="flex flex-col gap-2 text-sm">
              <span className="font-semibold">
                2. Send exactly {amount} to this {method.type === 'bank' ? 'account' : `${TYPE_NAMES[method.type]} number`}
              </span>
              <span className="flex flex-col gap-1.5 rounded-xl border border-line-strong bg-surface-2 p-3">
                <Detail label={method.type === 'bank' ? 'Bank' : 'Pay with'} value={method.name} />
                <Detail label={method.type === 'bank' ? 'Account number' : 'Number'} value={method.account_number} copy />
                <Detail label="Account name" value={method.account_name} copy />
              </span>
              {method.instructions && <p className="m-0 text-[13px] whitespace-pre-line text-text-2">{method.instructions}</p>}
              <span className="text-[13px] text-muted">Your app or bank may add its own transfer fee.</span>
            </div>

            <span className="text-sm font-semibold">3. Send us the receipt</span>
            <TextField
              label="Reference number"
              value={reference}
              maxLength={40}
              autoComplete="off"
              inputMode="text"
              placeholder="e.g. 1012 345 678 901"
              error={errors.reference_number}
              onChange={(e) => setReference(e.target.value)}
            />

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Receipt screenshot</span>
              <div className="flex flex-wrap items-stretch gap-3">
                {proof && <img src={proof.url} alt="Your receipt" className="h-32 w-auto max-w-40 rounded-xl border border-line object-contain" />}
                <UploadTile label={proof ? 'Choose another' : 'Upload screenshot'} hint="PNG, JPG or WEBP · up to 5 MB" accept={PROOF_TYPES.join(',')} onFile={pickProof} className="min-h-32 flex-1" />
              </div>
              {errors.proof && <p className="m-0 text-[13px] text-danger-text">{errors.proof}</p>}
            </div>
          </>
        )}

        <p className="m-0 text-[13px] text-muted">{note}</p>
        {errors.form && <Alert>{errors.form}</Alert>}

        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            Send for checking
          </Button>
        </div>
      </form>
    </div>
  )
}


function Detail({ label, value, copy = false }: { label: string; value: string; copy?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copyValue = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard needs https (or localhost); the value can still be selected by hand.
    }
  }
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
      <span className="min-w-32 text-[13px] text-muted">{label}</span>
      <span className="flex-1 font-semibold break-all select-all">{value}</span>
      {copy && (
        <Button size="sm" variant="ghost" onClick={copyValue} aria-label={`Copy ${label.toLowerCase()}`}>
          <Icon name={copied ? 'check' : 'copy'} size={14} />
          {copied ? 'Copied' : 'Copy'}
        </Button>
      )}
    </span>
  )
}
