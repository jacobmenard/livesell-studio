import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { Alert, Button, PasswordField, TextField } from '../../components/ui'
import { errorMessage, fieldErrors } from '../../lib/api'
import { checkEmail, checkPassword, compact, withoutKey } from '../../lib/validation'
import { AuthLayout } from './AuthLayout'

export function LoginPage() {
  const { login, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/setups'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(false)

  if (user && !loading) return <Navigate to={from} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (loading) return
    const next = compact({ email: checkEmail(email), password: checkPassword(password) })
    setErrors(next)
    setFormError('')
    if (Object.keys(next).length) return

    setLoading(true)
    try {
      await login(email.trim(), password, remember)
      navigate(from, { replace: true })
    } catch (error) {
      setPassword('')
      const fields = fieldErrors(error)
      // A wrong password comes back on the email field; show it once, at the top.
      setFormError(fields.email ?? errorMessage(error))
      setErrors(fields.password ? { password: fields.password } : {})
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 font-display text-[34px] leading-[1.05] font-extrabold tracking-[-0.02em]">Welcome back</h1>
        <p className="m-0 text-muted">
          Log in to open your saved live setups. <Link to="/pricing">See plans and pricing</Link>
        </p>
      </div>

      {formError && <Alert>{formError}</Alert>}

      <form noValidate onSubmit={submit} className="flex flex-col gap-[18px]">
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          maxLength={254}
          value={email}
          placeholder="you@example.com"
          error={errors.email}
          onChange={(e) => {
            setEmail(e.target.value)
            setErrors((prev) => withoutKey(prev, 'email'))
          }}
        />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          maxLength={128}
          value={password}
          error={errors.password}
          labelAside={
            <Link to="/forgot-password" className="text-[13px]">
              Forgot password?
            </Link>
          }
          onChange={(e) => {
            setPassword(e.target.value)
            setErrors((prev) => withoutKey(prev, 'password'))
          }}
        />
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
          <input type="checkbox" checked={remember} onChange={() => setRemember((r) => !r)} className="h-[18px] w-[18px] accent-link" />
          Keep me logged in on this device
        </label>
        <Button type="submit" variant="primary" size="lg" loading={loading}>
          {loading ? 'Logging in…' : 'Log in'}
        </Button>
      </form>

      <p className="m-0 text-sm text-muted">
        New to NegosyoWork Studio? <Link to="/register">Create an account</Link>
      </p>
    </AuthLayout>
  )
}
