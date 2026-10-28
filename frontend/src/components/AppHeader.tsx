import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { initials } from '../lib/format'
import { usePendingPayments } from '../lib/pendingPayments'
import { ThemeSwitch } from '../theme/ThemeSwitch'
import { cx } from './ui'
import { Logo } from './Logo'

export function AppHeader() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const superadmin = user?.role === 'superadmin'
  const pendingPayments = usePendingPayments(superadmin)

  const signOut = async () => {
    setBusy(true)
    try {
      await logout()
    } finally {
      navigate('/login', { replace: true })
    }
  }

  // Owners manage their team; only the superadmin sees Payments (with a pending badge), Users and Admin.
  // "tour" marks links the first-visit walkthrough points at.
  const links: { to: string; label: string; badge?: number; tour?: string }[] = [
    { to: '/setups', label: 'My setups' },
    { to: '/plans', label: 'Plan', tour: 'nav-plan' },
    ...(user && !user.is_subuser ? [{ to: '/team', label: 'Team', tour: 'nav-team' }] : []),
    ...(superadmin
      ? [
          { to: '/admin/payments', label: 'Payments', badge: pendingPayments },
          { to: '/admin/users', label: 'Users' },
          { to: '/admin', label: 'Admin' },
        ]
      : []),
  ]

  return (
    <header className="on-brand border-b border-white/10 bg-navy text-white">
      <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-4 px-[clamp(16px,3vw,32px)] py-3">
        <Link to="/setups" aria-label="NegosyoWork Studio, my setups" className="inline-flex min-h-11 items-center no-underline">
          <Logo size={32} variant="full" tone="onBrand" />
        </Link>
        <nav aria-label="Main" className="flex flex-wrap gap-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              data-tour={l.tour}
              end={l.to === '/setups' || l.to === '/admin'}
              className={({ isActive }) =>
                cx(
                  'inline-flex min-h-10 items-center rounded-full px-3.5 text-sm font-semibold no-underline transition-colors duration-150 motion-reduce:transition-none',
                  isActive ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/8 hover:text-white',
                )
              }
            >
              {l.label}
              {l.badge ? (
                <span className="ml-1.5 inline-grid min-w-5 place-items-center rounded-full bg-danger-solid px-1.5 text-xs font-bold text-white" aria-label={`${l.badge} waiting`}>
                  {l.badge > 99 ? '99+' : l.badge}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>
        <span className="flex-1" />
        <ThemeSwitch onBrand />
        {user && (
          <div className="flex items-center gap-2.5">
            <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-full bg-primary text-sm font-semibold text-white">
              {initials(user.name)}
            </span>
            <span className="flex max-w-44 flex-col leading-tight">
              <span className="truncate text-sm font-semibold">{user.name}</span>
              {/* A team member sees whose account they're working in. */}
              {user.is_subuser && <span className="truncate text-xs text-white/70">in {user.account_name}’s account</span>}
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={signOut}
          disabled={busy}
          className="inline-flex min-h-10 items-center rounded-full border-0 bg-white/12 px-4 text-sm font-semibold text-white transition-[transform,background-color] duration-150 hover:bg-white/20 active:scale-[0.97] disabled:opacity-60 motion-reduce:transition-none"
        >
          Log out
        </button>
      </div>
    </header>
  )
}
