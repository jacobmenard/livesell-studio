import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Alert, Button, PasswordField, TextField } from '../../components/ui'
import { errorMessage, fieldErrors } from '../../lib/api'
import { authApi } from '../../lib/endpoints'
import { checkEmail, checkPassword, compact } from '../../lib/validation'
import { AuthLayout } from './AuthLayout'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const problem = checkEmail(email)
    setError(problem ?? '')
    if (problem || loading) return
    setLoading(true)
    try {
      setSent(await authApi.forgotPassword(email.trim()))
    } catch (err) {
      setError(fieldErrors(err).email ?? errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 font-display text-[34px] leading-[1.05] font-extrabold tracking-[-0.02em]">Reset your password</h1>
        <p className="m-0 text-muted">We’ll email you a link to choose a new one.</p>
      </div>
      {sent ? (
        <Alert tone="success">{sent}</Alert>
      ) : (
        <form noValidate onSubmit={submit} className="flex flex-col gap-[18px]">
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            maxLength={254}
            value={email}
            error={error}
            onChange={(e) => (setEmail(e.target.value), setError(''))}
          />
          <Button type="submit" variant="primary" size="lg" loading={loading}>
            Send reset link
          </Button>
        </form>
      )}
      <p className="m-0 text-sm text-muted">
        <Link to="/login">Back to log in</Link>
      </p>
    </AuthLayout>
  )
}

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const email = params.get('email') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [done, setDone] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next = compact({
      password: checkPassword(password),
      password_confirmation: confirm === password ? undefined : 'The two passwords don’t match.',
    })
    setErrors(next)
    if (Object.keys(next).length || loading) return
    setLoading(true)
    try {
      setDone(await authApi.resetPassword({ token, email, password, password_confirmation: confirm }))
    } catch (err) {
      const fields = fieldErrors(err)
      setErrors(Object.keys(fields).length ? fields : { form: errorMessage(err) })
    } finally {
      setLoading(false)
    }
  }

  const invalidLink = !token || !email

  return (
    <AuthLayout>
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 font-display text-[34px] leading-[1.05] font-extrabold tracking-[-0.02em]">Choose a new password</h1>
        {email && <p className="m-0 text-muted">For {email}</p>}
      </div>
      {invalidLink ? (
        <Alert>This reset link is incomplete. Open the link from your email again, or ask for a new one.</Alert>
      ) : done ? (
        <>
          <Alert tone="success">{done}</Alert>
          <Link to="/login" className="font-semibold">
            Log in
          </Link>
        </>
      ) : (
        <form noValidate onSubmit={submit} className="flex flex-col gap-[18px]">
          {(errors.form || errors.email || errors.token) && <Alert>{errors.form ?? errors.email ?? errors.token}</Alert>}
          <PasswordField label="New password" autoComplete="new-password" maxLength={128} value={password} error={errors.password} hint="At least 8 characters." onChange={(e) => setPassword(e.target.value)} />
          <PasswordField label="Type it again" autoComplete="new-password" maxLength={128} value={confirm} error={errors.password_confirmation} onChange={(e) => setConfirm(e.target.value)} />
          <Button type="submit" variant="primary" size="lg" loading={loading}>
            Save new password
          </Button>
        </form>
      )}
      <p className="m-0 text-sm text-muted">
        <Link to="/forgot-password">Ask for a new link</Link>
      </p>
    </AuthLayout>
  )
}
