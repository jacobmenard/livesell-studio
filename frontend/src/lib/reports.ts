import type { SalesPeriod } from './types'

/** A "YYYY-MM-DD" day as local midnight (new Date("YYYY-MM-DD") would be UTC and can shift a day). */
function day(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const fmt = (date: Date, options: Intl.DateTimeFormatOptions) => date.toLocaleDateString('en-US', options)

/** "Thu, Oct 29, 2026", "Oct 26 – Nov 1, 2026" or "October 2026". */
export function periodLabel(period: SalesPeriod, start: string, end: string): string {
  const from = day(start)
  if (period === 'daily') return fmt(from, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  if (period === 'monthly') return fmt(from, { month: 'long', year: 'numeric' })
  const to = day(end)
  const sameYear = from.getFullYear() === to.getFullYear()
  return `${fmt(from, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })} – ${fmt(to, { month: 'short', day: 'numeric', year: 'numeric' })}`
}
