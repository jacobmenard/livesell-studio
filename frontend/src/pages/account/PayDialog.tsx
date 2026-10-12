import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { Alert, Button, TextField, UploadTile } from '../../components/ui'
import { errorMessage, fieldErrors } from '../../lib/api'
import { paymentsApi } from '../../lib/endpoints'
import { formatPrice } from '../../lib/format'
import type { Payment, PaymentDetails, Plan } from '../../lib/types'

const PROOF_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_PROOF_BYTES = 5 * 1024 * 1024

/**
 * Paying for a plan by hand: send the exact amount from GCash to the bank account, then
 * give the reference number and a screenshot of the receipt for the superadmin to check.
 */
export function PayDialog({
  plan,
  details,
  title,
  note,
  onClose,
  onPaid,
}: {
  plan: Plan
  details: PaymentDetails
  title: string
  /** What happens once it's approved (when the month starts, sub-users paused...). */
  note: ReactNode
  onClose: () => void
  onPaid: (payment: Payment) => void
}) {
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
    if (reference.replace(/[\s-]/g, '').length < 6) next.reference_number = 'Enter the reference number from your GCash receipt.'
    if (!proof) next.proof = 'Attach a screenshot of your GCash receipt.'
    setErrors(next)
    if (Object.keys(next).length > 0 || !proof) return

    setBusy(true)
    try {
      onPaid(await paymentsApi.submit({ plan: plan.code, reference_number: reference, proof: proof.file }))
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

        <ol className="m-0 flex list-none flex-col gap-3 p-0 text-sm">
          <Step n={1}>
            Open <strong>GCash</strong> → <strong>Bank Transfer</strong> → choose <strong>{details.bank_name || 'the bank below'}</strong>.
          </Step>
          <Step n={2}>
            <span className="flex flex-col gap-2">
              <span>Send to this account:</span>
              <span className="flex flex-col gap-1.5 rounded-xl border border-line-strong bg-surface-2 p-3">
                {details.bank_name && <Detail label="Bank" value={details.bank_name} />}
                <Detail label="Account number" value={details.account_number} copy />
                <Detail label="Account name" value={details.account_name} copy />
              </span>
            </span>
          </Step>
          <Step n={3}>
            Send exactly <strong>{amount}</strong>. GCash may add its own transfer fee.
          </Step>
          <Step n={4}>Enter the reference number from the GCash receipt and attach a screenshot of it.</Step>
        </ol>

        {details.instructions && <p className="m-0 text-[13px] whitespace-pre-line text-text-2">{details.instructions}</p>}

        <TextField
          label="Reference number"
          value={reference}
          maxLength={40}
          autoComplete="off"
          inputMode="text"
          placeholder="e.g. 1012 345 678 901"
          error={errors.reference_number}
          onChange={(e) => setReference(e.target.value)}
          autoFocus
        />

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Receipt screenshot</span>
          <div className="flex flex-wrap items-stretch gap-3">
            {proof && <img src={proof.url} alt="Your receipt" className="h-32 w-auto max-w-40 rounded-xl border border-line object-contain" />}
            <UploadTile label={proof ? 'Choose another' : 'Upload screenshot'} hint="PNG, JPG or WEBP · up to 5 MB" accept={PROOF_TYPES.join(',')} onFile={pickProof} className="min-h-32 flex-1" />
          </div>
          {errors.proof && <p className="m-0 text-[13px] text-danger-text">{errors.proof}</p>}
        </div>

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

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-raised text-xs font-bold">
        {n}
      </span>
      <span className="min-w-0 flex-1 pt-0.5">{children}</span>
    </li>
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
