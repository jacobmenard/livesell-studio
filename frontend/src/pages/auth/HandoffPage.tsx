import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { Alert, Spinner } from '../../components/ui'
import { errorMessage } from '../../lib/api'
import { authApi } from '../../lib/endpoints'
import { readHandoff } from '../../lib/handoff'
import { AuthLayout } from './AuthLayout'

/** Opened from the Android app (e.g. "Pay or renew"): signs in with its one-time code, then goes on. */
export function HandoffPage() {
  const { setUser } = useAuth()
  const navigate = useNavigate()
  // Read once: the code is wiped from the address bar straight away.
  const [handoff] = useState(() => readHandoff(window.location.hash))
  const [error, setError] = useState(handoff ? '' : 'This link is incomplete. Open it again from the app, or log in.')
  // The code works once: never send it twice (React's development double-run, a re-render).
  const sent = useRef(false)

  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname)
    if (!handoff || sent.current) return
    sent.current = true
    authApi
      .handoff(handoff.code)
      .then((user) => {
        setUser(user)
        navigate(handoff.next, { replace: true })
      })
      .catch((err) => setError(errorMessage(err)))
  }, [handoff, navigate, setUser])

  return (
    <AuthLayout>
      {error ? (
        <>
          <Alert>{error}</Alert>
          <p className="m-0 text-sm text-muted">
            <Link to="/login" state={{ from: handoff?.next ?? '/plans' }}>
              Log in instead
            </Link>
          </p>
        </>
      ) : (
        <Spinner label="Signing you in…" />
      )}
    </AuthLayout>
  )
}
