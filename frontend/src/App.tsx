import { Navigate, Outlet, createBrowserRouter, useLocation } from 'react-router'
import { useAuth } from './auth/AuthProvider'
import { ImpersonationBanner } from './components/ImpersonationBanner'
import { RouteError } from './components/RouteError'
import { Spinner } from './components/ui'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/auth/LoginPage'
import { ForgotPasswordPage, ResetPasswordPage } from './pages/auth/PasswordPages'
import { RegisterPage } from './pages/auth/RegisterPage'
import { PricingPage } from './pages/PricingPage'

// The editor (camera, effects, sounds) and the clean screen load on demand.
const editor = () => import('./pages/editor/EditorPage').then((m) => ({ Component: m.EditorPage }))
const ownerOutput = () => import('./pages/output/OutputPages').then((m) => ({ Component: m.OwnerOutputPage }))
const linkOutput = () => import('./pages/output/OutputPages').then((m) => ({ Component: m.LinkOutputPage }))
const plans = () => import('./pages/account/PlansPage').then((m) => ({ Component: m.PlansPage }))
const team = () => import('./pages/account/TeamPage').then((m) => ({ Component: m.TeamPage }))
const admin = () => import('./pages/admin/AdminPage').then((m) => ({ Component: m.AdminPage }))
const adminPayments = () => import('./pages/admin/AdminPaymentsPage').then((m) => ({ Component: m.AdminPaymentsPage }))

/** Pages that need a signed-in seller. */
function RequireAuth() {
  const { state } = useAuth()
  const location = useLocation()
  if (state.status === 'loading') {
    return (
      <main className="grid min-h-screen place-items-center bg-bg">
        <Spinner label="Loading…" />
      </main>
    )
  }
  if (state.status === 'guest') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  // Never on the clean screen: OBS / TikTok LIVE Studio would capture it.
  const cleanScreen = location.pathname.endsWith('/screen')
  return (
    <>
      {!cleanScreen && <ImpersonationBanner />}
      <Outlet />
    </>
  )
}

function GuestOnly() {
  const { state } = useAuth()
  if (state.status === 'loading') {
    return (
      <main className="grid min-h-screen place-items-center bg-bg">
        <Spinner label="Loading…" />
      </main>
    )
  }
  return <Outlet />
}

function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-text">
      <div className="flex flex-col gap-3">
        <h1 className="m-0 font-display text-3xl font-extrabold">Page not found</h1>
        <a href="/setups">Go to my setups</a>
      </div>
    </main>
  )
}

export const router = createBrowserRouter([
  {
    // A page that fails to load (e.g. a file from before the last deploy) or crashes.
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <Navigate to="/setups" replace /> },
      {
        element: <GuestOnly />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
          { path: '/forgot-password', element: <ForgotPasswordPage /> },
          { path: '/reset-password', element: <ResetPasswordPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          { path: '/setups', element: <DashboardPage /> },
          { path: '/setups/:id', lazy: editor },
          { path: '/setups/:id/screen', lazy: ownerOutput },
          { path: '/plans', lazy: plans },
          { path: '/team', lazy: team },
          { path: '/admin', lazy: admin },
          { path: '/admin/payments', lazy: adminPayments },
        ],
      },
      // Public pricing (signed in or not).
      { path: '/pricing', element: <PricingPage /> },
      // Public, token-protected clean screen for OBS / TikTok LIVE Studio.
      { path: '/output/:token', lazy: linkOutput },
      { path: '*', element: <NotFound /> },
    ],
  },
])
