import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { AppPage } from '../../components/AppPage'
import { Icon } from '../../components/Icon'
import { PaymentStatusBadge } from '../../components/PaymentStatus'
import { Alert, Button, Spinner, cx } from '../../components/ui'
import { errorMessage } from '../../lib/api'
import { subscriptionApi } from '../../lib/endpoints'
import { formatDate, formatPrice } from '../../lib/format'
import type { Payment, Plan, SubscriptionSummary } from '../../lib/types'
import { marketingFor } from '../../pricing/planCatalog'
import { ComparePlans, PricingCards } from '../../pricing/PricingCards'
import { PayDialog } from './PayDialog'

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

type Notice = { tone: 'success' | 'error' | 'info'; text: string }
/** What the pay dialog is for: the next month of the current plan, or another plan. */
type Paying = { plan: Plan; kind: 'renew' | 'new' | 'switch' }

export function PlansPage() {
  const { user } = useAuth()
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [paying, setPaying] = useState<Paying | null>(null)
  const owner = user !== null && !user.is_subuser

  useEffect(() => {
    let cancelled = false
    subscriptionApi
      .show()
      .then((s) => !cancelled && setSummary(s))
      .catch((e) => !cancelled && setLoadError(errorMessage(e, "We couldn't load your plan.")))
    return () => {
      cancelled = true
    }
  }, [])

  const closeDialog = useCallback(() => setPaying(null), [])

  const paid = async (payment: Payment) => {
    const kind = paying?.kind
    setPaying(null)
    setNotice({
      tone: 'success',
      text:
        kind === 'renew'
          ? `Renewal sent for checking (ref ${payment.reference_number}). Your next month of ${payment.plan.name} is added once it's approved.`
          : `Payment sent for checking (ref ${payment.reference_number}). ${payment.plan.name} switches on as soon as it's approved. We'll email you.`,
    })
    try {
      setSummary(await subscriptionApi.show())
    } catch (e) {
      setLoadError(errorMessage(e, "We couldn't refresh your plan."))
    }
  }

  return (
    <AppPage title="Plan" subtitle="Choose the plan that fits your live-selling business.">
      {loadError && <Alert>{loadError}</Alert>}
      {!summary && !loadError && <Spinner label="Loading your plan…" />}

      {summary && (
        <>
          <CurrentPlan summary={summary} owner={owner} accountName={user?.account_name ?? ''} />

          {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

          {owner && (summary.next_payment || summary.payments.length > 0) && (
            <Billing summary={summary} onRenew={(plan) => setPaying({ plan, kind: 'renew' })} />
          )}

          <PricingCards
            plans={summary.plans}
            currentCode={summary.trial_ends_at ? undefined : summary.plan.code}
            renderAction={(plan) => <PlanAction plan={plan} summary={summary} owner={owner} onPay={setPaying} />}
          />

          <p className="m-0 text-[13px] text-muted">
            {owner
              ? 'Pay by GCash, then send the reference number and a screenshot of the receipt. Your plan starts the day the payment is approved and runs for a month. Renew anytime in the last month; switching plans starts a fresh month (days left aren’t carried over).'
              : `Only ${user?.account_name} can change the plan.`}
          </p>

          <ComparePlans plans={summary.plans} />

          {paying && (
            <PayDialog
              plan={paying.plan}
              title={paying.kind === 'renew' ? `Renew ${paying.plan.name}` : `Pay for ${paying.plan.name}`}
              note={payNote(paying, summary)}
              onClose={closeDialog}
              onPaid={paid}
            />
          )}
        </>
      )}
    </AppPage>
  )
}

/** What approval will do, shown in the pay dialog. */
function payNote({ plan, kind }: Paying, summary: SubscriptionSummary): string {
  if (kind === 'renew') {
    return `Once approved, one more month is added after ${formatDate(summary.next_payment?.due_at ?? summary.ends_at)}.`
  }
  const paused = Math.max(0, summary.usage.subusers - plan.max_subusers)
  const pausedNote = paused > 0 ? ` ${count(paused, 'sub-user', 'sub-users')} will be paused (not deleted).` : ''
  if (kind === 'switch') {
    return `${plan.name} starts fresh the day your payment is approved and runs for a month. Days left on ${summary.plan.name} aren’t carried over.${pausedNote}`
  }
  const trialNote = summary.trial_ends_at ? ' Your free trial ends then.' : ''
  return `${plan.name} starts the day your payment is approved and runs for a month.${trialNote}${pausedNote}`
}

function CurrentPlan({ summary, owner, accountName }: { summary: SubscriptionSummary; owner: boolean; accountName: string }) {
  const { plan } = summary
  const free = !plan.purchasable
  const trialEndsAt = summary.trial_ends_at
  let status = 'No end date.'
  if (trialEndsAt) status = `You can go live free until ${formatDate(trialEndsAt)}. Choose a plan and send your payment to keep going live after that.`
  else if (free) status = 'Set up your camera, popups and backgrounds for free. Choose a plan to go live.'
  else if (summary.ends_at) status = `Paid until ${formatDate(summary.ends_at)}. Renew before then to keep going live.`

  return (
    <section aria-label="Your plan" className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-[20px] border border-line bg-surface p-[18px]">
      <div className="flex min-w-60 flex-1 flex-col gap-1">
        <span className="text-[13px] text-muted">{owner ? 'Your plan' : `${accountName}’s plan`}</span>
        <span className="font-display text-2xl font-extrabold">
          {trialEndsAt ? 'Free trial' : plan.name}
          {trialEndsAt && <span className="text-base font-semibold text-muted"> · {plan.name} features</span>}
          {!free && !trialEndsAt && <span className="text-base font-semibold text-muted"> · {formatPrice(plan.price_monthly, plan.currency)}/month</span>}
        </span>
        <span className="text-[13px] text-text-2">{status}</span>
      </div>
      <Meter label="Sub-users" used={summary.usage.subusers} max={plan.max_subusers} />
      <Meter label="Setups live now" used={summary.usage.live_setups} max={plan.max_live_setups} />
    </section>
  )
}

/** The next month to pay (click to renew), then the payments sent so far. */
function Billing({ summary, onRenew }: { summary: SubscriptionSummary; onRenew: (plan: Plan) => void }) {
  const next = summary.next_payment
  const pending = summary.pending_payment
  const canRenew = next !== null && !pending && next.renewable_from === null

  let renewHint = 'Renew'
  if (pending) renewHint = 'Payment being checked'
  else if (next?.renewable_from) renewHint = `Renew from ${formatDate(next.renewable_from)}`

  return (
    <section aria-labelledby="billing-h" className="flex flex-col gap-2 rounded-[20px] border border-line bg-surface p-[18px]">
      <h2 id="billing-h" className="m-0 font-display text-xl font-semibold">
        Billing
      </h2>
      <ul className="m-0 flex list-none flex-col divide-y divide-line p-0 text-sm">
        {next && (
          <li>
            <button
              type="button"
              onClick={() => onRenew(next.plan)}
              disabled={!canRenew}
              className={cx(
                'flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-transparent bg-transparent px-2 py-3 text-left text-text',
                canRenew ? 'cursor-pointer hover:border-line-strong hover:bg-surface-2' : 'cursor-default',
              )}
            >
              <span className="min-w-28 text-text-2">Due {formatDate(next.due_at)}</span>
              <span className="flex-1">
                <span className="font-semibold">Next month</span> · {next.plan.name}
              </span>
              <span className="font-semibold">{formatPrice(next.amount, next.currency)}</span>
              <span className={cx('inline-flex items-center gap-1 text-[13px] font-semibold', canRenew ? 'text-link' : 'text-muted')}>
                {renewHint}
                {canRenew && <Icon name="back" size={14} className="rotate-180" />}
              </span>
            </button>
          </li>
        )}
        {summary.payments.map((p) => (
          <PaymentRow key={p.id} payment={p} />
        ))}
      </ul>
    </section>
  )
}

function PaymentRow({ payment: p }: { payment: Payment }) {
  let detail: ReactNode = `Sent ${formatDate(p.submitted_at)} · ref ${p.reference_number}`
  if (p.status === 'approved' && p.period_start) detail = `${formatDate(p.period_start)} – ${formatDate(p.period_end)} · ref ${p.reference_number}`
  return (
    <li className="flex flex-col gap-1 px-2 py-3">
      <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="min-w-28 text-text-2">{formatDate(p.submitted_at)}</span>
        <span className="flex-1">{p.plan.name}</span>
        <span className="font-semibold">{formatPrice(p.amount, p.currency)}</span>
        <PaymentStatusBadge status={p.status} />
      </span>
      <span className="text-[13px] text-muted">{detail}</span>
      {p.status === 'pending' && <span className="text-[13px] text-text-2">We’re checking this payment. Your plan updates as soon as it’s approved.</span>}
      {p.status === 'rejected' && p.review_note && <span className="text-[13px] text-danger-text">Reason: {p.review_note}</span>}
    </li>
  )
}

/** The button on a plan card: pay for it, renew it, or why it can't be paid right now. */
function PlanAction({ plan, summary, owner, onPay }: { plan: Plan; summary: SubscriptionSummary; owner: boolean; onPay: (paying: Paying) => void }) {
  // During the free trial no plan is "yours" yet: every paid plan can be chosen.
  const onTrial = summary.trial_ends_at !== null
  const current = !onTrial && plan.code === summary.plan.code
  const pending = summary.pending_payment

  if (!owner) return current ? <Button disabled>Current plan</Button> : null
  // Free isn't bought: a paid account goes back to it when the paid month ends.
  if (!plan.purchasable) return current ? <Button disabled>Your plan</Button> : null
  if (pending) return <Button disabled>{pending.plan.code === plan.code ? 'Being checked' : marketingFor(plan).cta}</Button>

  if (current) {
    const next = summary.next_payment
    if (!next) return <Button disabled>Your plan</Button>
    if (next.renewable_from) return <Button disabled>Renew from {formatDate(next.renewable_from)}</Button>
    return (
      <Button variant="primary" onClick={() => onPay({ plan, kind: 'renew' })}>
        Renew next month
      </Button>
    )
  }

  const onFree = onTrial || !summary.plan.purchasable
  const label = onFree ? marketingFor(plan).cta : plan.price_monthly > summary.plan.price_monthly ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`
  return (
    <Button variant={onFree || plan.price_monthly > summary.plan.price_monthly ? 'primary' : 'secondary'} onClick={() => onPay({ plan, kind: onFree ? 'new' : 'switch' })}>
      {label}
    </Button>
  )
}

function Meter({ label, used, max }: { label: string; used: number; max: number }) {
  const full = max > 0 && used >= max
  return (
    <div className="flex min-w-36 flex-col gap-1">
      <span className="text-[13px] text-muted">{label}</span>
      <span className={cx('text-lg font-semibold', full ? 'text-link' : 'text-text')}>
        {used} of {max}
      </span>
      <span className="block h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
        <span className="block h-full rounded-full bg-select" style={{ width: `${max === 0 ? 0 : Math.min(100, (used / max) * 100)}%` }} />
      </span>
    </div>
  )
}
