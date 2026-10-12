import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { Logo } from '../components/Logo'
import { Alert, Spinner, cx } from '../components/ui'
import { errorMessage } from '../lib/api'
import { plansApi } from '../lib/endpoints'
import { formatPrice } from '../lib/format'
import type { Plan } from '../lib/types'
import { marketingFor } from '../pricing/planCatalog'
import { ComparePlans, PricingCards } from '../pricing/PricingCards'
import { ThemeSwitch } from '../theme/ThemeSwitch'

const LINK_BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold no-underline transition-[transform,opacity,background-color,filter] duration-150 active:scale-[0.97] active:opacity-80 motion-reduce:transition-none'

/** The public pricing page: what each plan includes, with a way in for new and signed-in sellers. */
export function PricingPage() {
  const { state } = useAuth()
  const signedIn = state.status === 'signed-in'
  const [plans, setPlans] = useState<Plan[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    plansApi
      .list()
      .then((p) => !cancelled && setPlans(p))
      .catch((e) => !cancelled && setError(errorMessage(e, "We couldn't load the plans.")))
    return () => {
      cancelled = true
    }
  }, [])

  // "₱299 — I sell alone" and so on, from the real prices.
  const ladder = (plans ?? [])
    .filter((p) => p.purchasable)
    .map((p) => ({ code: p.code, price: formatPrice(p.price_monthly, p.currency), line: { solo: 'I sell alone.', duo: 'I sell with an assistant.', team: 'I run a team.' }[p.code] }))
    .filter((l) => l.line)

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="on-brand border-b border-white/10 bg-navy text-white">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-4 px-[clamp(16px,3vw,32px)] py-3">
          <Link to="/" aria-label="NegosyoWork Studio" className="inline-flex min-h-11 items-center no-underline">
            <Logo size={32} variant="full" tone="onBrand" />
          </Link>
          <span className="flex-1" />
          <ThemeSwitch onBrand />
          {signedIn ? (
            <Link to="/setups" className={cx(LINK_BUTTON, 'bg-white/12 text-white hover:bg-white/20')}>
              My setups
            </Link>
          ) : (
            <Link to="/login" className={cx(LINK_BUTTON, 'bg-white/12 text-white hover:bg-white/20')}>
              Log in
            </Link>
          )}
        </div>
      </header>

      <section className="on-brand bg-navy text-white">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-2 px-[clamp(16px,3vw,32px)] pt-8 pb-10 text-center">
          <h1 className="m-0 font-display text-[clamp(30px,3.6vw,46px)] leading-[1.08] font-bold tracking-[-0.025em]">Choose the plan that fits your live-selling business</h1>
          <p className="m-0 text-white/75">Professional live setup · TikTok, Facebook and YouTube · backgrounds, popups and effects · soundboard · direct streaming · team collaboration</p>
        </div>
      </section>

      <main className="mx-auto flex max-w-[1100px] flex-col gap-6 px-[clamp(16px,3vw,32px)] pt-8 pb-16">

        {error && <Alert>{error}</Alert>}
        {!plans && !error && <Spinner label="Loading plans…" />}

        {plans && (
          <>
            <PricingCards
              plans={plans}
              renderAction={(plan) => (
                <Link
                  to={signedIn ? '/plans' : '/register'}
                  className={cx(LINK_BUTTON, marketingFor(plan).popular || !plan.purchasable ? 'bg-primary text-white hover:brightness-110' : 'bg-tint text-link hover:bg-tint-hover')}
                >
                  {marketingFor(plan).cta}
                </Link>
              )}
            />

            {ladder.length > 0 && (
              <p className="m-0 flex flex-wrap justify-center gap-x-6 gap-y-1 text-center text-sm text-text-2">
                {ladder.map((l) => (
                  <span key={l.code}>
                    <strong className="text-text">{l.price}</strong> — {l.line}
                  </span>
                ))}
              </p>
            )}

            <ComparePlans plans={plans} />
          </>
        )}
      </main>
    </div>
  )
}
