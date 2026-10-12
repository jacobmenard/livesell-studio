/** "Edited today, 7:40 PM", "Edited yesterday", "Edited Sep 28" (or with the year if older). */
export function editedLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'Not edited yet'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Not edited yet'

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)

  if (days <= 0) return `Edited today, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  if (days === 1) return 'Edited yesterday'
  const sameYear = date.getFullYear() === now.getFullYear()
  return `Edited ${date.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })}`
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2)
  return letters.toUpperCase()
}

/** A plan price, e.g. "₱999" (whole units of the currency). */
export function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${currency} ${amount}`
  }
}

/** A date like "Oct 31, 2026", or "" when there is none. */
export function formatDate(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}
