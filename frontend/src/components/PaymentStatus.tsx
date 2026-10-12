import type { PaymentStatus } from '../lib/types'
import { cx } from './ui'

const LABELS: Record<PaymentStatus, string> = {
  pending: 'Being checked',
  approved: 'Paid',
  rejected: 'Rejected',
}

/** A payment's status as a small pill (the seller's history and the superadmin's list). */
export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        status === 'approved' && 'bg-success/15 text-success-text',
        status === 'pending' && 'border border-line-strong bg-surface-2 text-text-2',
        status === 'rejected' && 'bg-danger-bg text-danger-text',
      )}
    >
      {LABELS[status]}
    </span>
  )
}
