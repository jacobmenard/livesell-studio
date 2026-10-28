import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { AppPage } from '../../components/AppPage'
import { DataTable, type Column } from '../../components/DataTable'
import { Alert, Button, Panel, Segmented, Spinner, TextField } from '../../components/ui'
import { errorMessage, fieldErrors } from '../../lib/api'
import { adminApi } from '../../lib/endpoints'
import { formatPrice, plural } from '../../lib/format'
import { periodLabel } from '../../lib/reports'
import type { SalesPeriod, SalesReport } from '../../lib/types'

const PERIODS: { id: SalesPeriod; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
]

type Row = SalesReport['rows'][number]
type PlanRow = SalesReport['by_plan'][number]

/** Superadmin: sales from approved payments, by day, week or month. */
export function AdminReportsPage() {
  const { user } = useAuth()
  if (user?.role !== 'superadmin') {
    return (
      <AppPage title="Reports">
        <Alert>This page is for the superadmin only.</Alert>
      </AppPage>
    )
  }
  return (
    <AppPage
      title="Reports"
      subtitle="Sales from approved payments, counted on the day each was approved (Philippine time)."
      actions={
        <Link to="/admin/payments" className="text-sm font-semibold">
          Payments
        </Link>
      }
    >
      <SalesReportView />
    </AppPage>
  )
}

function SalesReportView() {
  // What the report shows; no dates means the last 30 days, 12 weeks or 12 months.
  const [request, setRequest] = useState<{ period: SalesPeriod; from?: string; to?: string }>({ period: 'daily' })
  const [report, setReport] = useState<SalesReport | null>(null)
  const [range, setRange] = useState({ from: '', to: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    adminApi
      .salesReport(request)
      .then((r) => {
        if (cancelled) return
        setReport(r)
        // The range actually covered (snapped to whole weeks or months).
        setRange({ from: r.from, to: r.to })
        setError('')
        setErrors({})
      })
      .catch((e) => {
        if (cancelled) return
        const fields = fieldErrors(e)
        if (Object.keys(fields).length) setErrors(fields)
        else setError(errorMessage(e, "We couldn't load the report."))
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [request])

  const load = (next: typeof request) => {
    setLoading(true)
    setRequest(next)
  }

  const submitRange = (e: FormEvent) => {
    e.preventDefault()
    load({ period: request.period, from: range.from || undefined, to: range.to || undefined })
  }

  return (
    <>
      <Panel>
        <div className="flex flex-col gap-4">
          <div className="max-w-sm">
            <Segmented label="Group sales by" options={PERIODS} value={request.period} onChange={(period) => load({ period })} />
          </div>
          <form noValidate onSubmit={submitRange} className="grid items-start gap-2 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
            <TextField label="From" type="date" value={range.from} max={range.to || undefined} error={errors.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
            <TextField label="To" type="date" value={range.to} min={range.from || undefined} error={errors.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
            {/* Lines the button up with the inputs, under their labels. */}
            <div className="flex flex-col gap-1.5">
              <span aria-hidden="true" className="text-sm">
                &nbsp;
              </span>
              <Button type="submit" variant="primary" loading={loading}>
                Show
              </Button>
            </div>
          </form>
          {errors.period && <Alert>{errors.period}</Alert>}
        </div>
      </Panel>

      {error && <Alert>{error}</Alert>}
      {!report && !error && <Spinner label="Loading the report…" />}
      {report && <Results report={report} />}
    </>
  )
}

function Results({ report }: { report: SalesReport }) {
  const money = (amount: number) => formatPrice(amount, report.currency)
  const columns: Column<Row>[] = periodColumns(report, money)
  const planColumns: Column<PlanRow>[] = byPlanColumns(money)
  // Newest first: the latest period is what's usually looked at.
  const rows = [...report.rows].reverse()
  const busiest = report.rows.reduce<Row | null>((best, r) => (r.total > (best?.total ?? 0) ? r : best), null)
  const unit = { daily: 'day', weekly: 'week', monthly: 'month' }[report.period]

  return (
    <>
      <dl className="m-0 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <Stat label="Total sales">{money(report.total)}</Stat>
        <Stat label="Approved payments">{report.count}</Stat>
        <Stat label="Average payment">{report.count ? money(Math.round(report.total / report.count)) : '—'}</Stat>
        <Stat label={`Best ${unit}`} note={busiest ? periodLabel(report.period, busiest.start, busiest.end) : undefined}>
          {busiest ? money(busiest.total) : '—'}
        </Stat>
      </dl>

      <Panel title="By period" subtitle={`${periodLabel('daily', report.from, report.from)} to ${periodLabel('daily', report.to, report.to)} · newest first`} headingId="periods-h">
        <DataTable caption={`Sales by ${unit}`} columns={columns} rows={rows} rowKey={(r) => r.start} />
      </Panel>

      <Panel title="By plan" subtitle="Same dates, biggest first." headingId="plans-h">
        {report.by_plan.length === 0 ? (
          <p className="m-0 text-sm text-muted">No approved payments in these dates.</p>
        ) : (
          <DataTable caption="Sales by plan" columns={planColumns} rows={report.by_plan} rowKey={(p) => p.plan_id} />
        )}
      </Panel>
    </>
  )
}

function Stat({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-[20px] border border-line bg-surface p-[18px]">
      <dt className="text-[13px] font-semibold text-muted">{label}</dt>
      <dd className="m-0 font-display text-[28px] leading-tight font-bold tracking-[-0.02em] tabular-nums">{children}</dd>
      {note && <dd className="m-0 text-[13px] text-text-2">{note}</dd>}
    </div>
  )
}

function periodColumns(report: SalesReport, money: (amount: number) => string): Column<Row>[] {
  return [
    { header: 'Period', cell: (r) => periodLabel(report.period, r.start, r.end) },
    { header: 'Payments', align: 'right', cell: (r) => <span className={r.count ? 'tabular-nums' : 'text-muted'}>{r.count}</span> },
    { header: 'Sales', align: 'right', cell: (r) => <span className={r.total ? 'font-semibold tabular-nums' : 'text-muted tabular-nums'}>{money(r.total)}</span> },
  ]
}

function byPlanColumns(money: (amount: number) => string): Column<PlanRow>[] {
  return [
    { header: 'Plan', cell: (p) => <span className="font-semibold">{p.name}</span> },
    { header: 'Payments', align: 'right', cell: (p) => <span className="tabular-nums">{plural(p.count, 'payment')}</span> },
    { header: 'Sales', align: 'right', cell: (p) => <span className="font-semibold tabular-nums">{money(p.total)}</span> },
  ]
}
