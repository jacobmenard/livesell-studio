import type { ReactNode } from 'react'
import { Icon } from '../components/Icon'
import { cx } from '../components/ui'
import { formatPrice } from '../lib/format'
import type { Plan } from '../lib/types'
import { COMPARE, marketingFor, planHighlights, type Cell } from './planCatalog'

/** The four plans side by side, short and scannable (the full list is in ComparePlans). */
export function PricingCards({ plans, currentCode, renderAction }: { plans: Plan[]; currentCode?: string; renderAction: (plan: Plan) => ReactNode }) {
  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
      {plans.map((plan) => {
        const m = marketingFor(plan)
        const current = plan.code === currentCode
        const highlights = planHighlights(plan)
        return (
          <section
            key={plan.code}
            aria-labelledby={`plan-${plan.code}`}
            className={cx('relative flex flex-col gap-3 rounded-[20px] border-2 bg-surface p-[18px]', current ? 'border-select' : m.popular ? 'border-primary' : 'border-line')}
          >
            {m.popular && (
              <span className="absolute -top-3 left-[18px] rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold tracking-wide text-white">⭐ MOST POPULAR</span>
            )}
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-semibold tracking-wide text-muted uppercase">{plan.name}</span>
              <h2 id={`plan-${plan.code}`} className="m-0 font-display text-xl font-semibold">
                {m.emoji && <span aria-hidden="true">{m.emoji} </span>}
                {m.title}
              </h2>
            </div>
            <span className="font-display text-3xl font-extrabold">
              {formatPrice(plan.price_monthly, plan.currency)}
              {plan.price_monthly > 0 && <span className="text-base font-semibold text-muted">/month</span>}
            </span>
            <p className="m-0 text-sm text-text-2">{m.tagline}</p>
            {highlights.length > 0 && <p className="m-0 flex-1 text-[13px] font-semibold text-text">{highlights.join(' • ')}</p>}
            {highlights.length === 0 && <span className="flex-1" />}
            {renderAction(plan)}
          </section>
        )
      })}
    </div>
  )
}

/** Every feature by plan, folded away until asked for. */
export function ComparePlans({ plans }: { plans: Plan[] }) {
  return (
    <details className="rounded-[20px] border border-line bg-surface p-[18px]">
      <summary className="cursor-pointer font-display text-lg font-semibold">Compare all features</summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr>
              <th scope="col" className="py-2 pr-3 text-left font-semibold text-muted">
                Feature
              </th>
              {plans.map((p) => (
                <th key={p.code} scope="col" className="px-2 py-2 text-center font-semibold">
                  {p.name}
                  {marketingFor(p).popular && <span aria-label="most popular"> ⭐</span>}
                </th>
              ))}
            </tr>
          </thead>
          {COMPARE.map((section) => (
            <tbody key={section.group}>
              <tr>
                <th colSpan={plans.length + 1} scope="colgroup" className="pt-4 pb-1 text-left text-xs font-semibold tracking-wide text-muted uppercase">
                  {section.group}
                </th>
              </tr>
              {section.rows.map((row) => (
                <tr key={row.label} className="border-t border-line">
                  <th scope="row" className="py-2 pr-3 text-left font-normal text-text-2">
                    {row.label}
                  </th>
                  {plans.map((p) => (
                    <td key={p.code} className="px-2 py-2 text-center">
                      <CellValue value={row.cell(p)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <p className="m-0 mt-3 text-xs text-muted">“Preview” means you can try it in the editor; going live needs a paid plan.</p>
    </details>
  )
}

function CellValue({ value }: { value: Cell }) {
  if (value === true) {
    return (
      <>
        <Icon name="check" size={16} strokeWidth={2.6} className="inline text-select" />
        <span className="sr-only">Included</span>
      </>
    )
  }
  if (value === false) {
    return (
      <>
        <span aria-hidden="true" className="text-muted">
          —
        </span>
        <span className="sr-only">Not included</span>
      </>
    )
  }
  return <span className={value === 'Preview' ? 'text-xs font-semibold text-muted' : ''}>{value}</span>
}
