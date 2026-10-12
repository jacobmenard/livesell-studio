import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { Alert, Button, PasswordField, TextField } from '../../components/ui'
import { errorMessage, fieldErrors } from '../../lib/api'
import { checkEmail, checkPassword, compact, withoutKey } from '../../lib/validation'
import { AuthLayout } from './AuthLayout'

export function RegisterPage() {
  const { register, user } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(false)

  if (user && !loading) return <Navigate to="/setups" replace />

  const clear = (field: string) => setErrors((e) => withoutKey(e, field))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (loading) return
    const next = compact({
      name: name.trim() ? undefined : 'Enter your name or your shop’s name.',
      email: checkEmail(email),
      password: checkPassword(password),
      password_confirmation: confirm === password ? undefined : 'The two passwords don’t match.',
    })
    setErrors(next)
    setFormError('')
    if (Object.keys(next).length) return

    setLoading(true)
    try {
      await register({ name: name.trim(), email: email.trim(), password, password_confirmation: confirm })
      navigate('/setups', { replace: true })
    } catch (error) {
      const fields = fieldErrors(error)
      setErrors(fields)
      if (!Object.keys(fields).length) setFormError(errorMessage(error))
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 font-display text-[34px] leading-[1.05] font-extrabold tracking-[-0.02em]">Create your account</h1>
        <p className="m-0 text-muted">
          Free to start: save your live setups and open them in one tap. <Link to="/pricing">See plans and pricing</Link>
        </p>
      </div>
      {formError && <Alert>{formError}</Alert>}
      <form noValidate onSubmit={submit} className="flex flex-col gap-[18px]">
        <TextField label="Your name or shop" autoComplete="name" maxLength={80} value={name} error={errors.name} onChange={(e) => (setName(e.target.value), clear('name'))} />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          maxLength={254}
          value={email}
          placeholder="you@example.com"
          error={errors.email}
          onChange={(e) => (setEmail(e.target.value), clear('email'))}
        />
        <PasswordField
          label="Password"
          autoComplete="new-password"
          maxLength={128}
          value={password}
          error={errors.password}
          hint="At least 8 characters."
          onChange={(e) => (setPassword(e.target.value), clear('password'))}
        />
        <PasswordField
          label="Type it again"
          autoComplete="new-password"
          maxLength={128}
          value={confirm}
          error={errors.password_confirmation}
          onChange={(e) => (setConfirm(e.target.value), clear('password_confirmation'))}
        />
        <Button type="submit" variant="primary" size="lg" loading={loading}>
          {loading ? 'Creating your account…' : 'Create account'}
        </Button>
      </form>
      <p className="m-0 text-sm text-muted">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </AuthLayout>
  )
}
