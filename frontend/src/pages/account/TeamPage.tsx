import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { AppPage } from '../../components/AppPage'
import { Alert, Button, PasswordField, Spinner, TextField, cx } from '../../components/ui'
import { errorMessage, fieldErrors } from '../../lib/api'
import { teamApi } from '../../lib/endpoints'
import { formatDate } from '../../lib/format'
import type { TeamMember, TeamState } from '../../lib/types'

const EMPTY = { name: '', email: '', password: '' }

/** The owner's sub-users: their own login, working in the owner's account. */
export function TeamPage() {
  const { user } = useAuth()

  if (user?.is_subuser) {
    return (
      <AppPage title="Team">
        <Alert tone="info">Only {user.account_name} manages the team.</Alert>
      </AppPage>
    )
  }
  return <OwnerTeam />
}

function OwnerTeam() {
  const [team, setTeam] = useState<TeamState | null>(null)
  const [loadError, setLoadError] = useState('')
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<number | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    teamApi
      .show()
      .then((t) => !cancelled && setTeam(t))
      .catch((e) => !cancelled && setLoadError(errorMessage(e, "We couldn't load your team.")))
    return () => {
      cancelled = true
    }
  }, [])

  const add = async (e: FormEvent) => {
    e.preventDefault()
    setAdding(true)
    setErrors({})
    setNotice(null)
    try {
      const next = await teamApi.add({ name: form.name.trim(), email: form.email.trim(), password: form.password })
      setTeam(next)
      setForm(EMPTY)
      setNotice({ tone: 'success', text: `${form.name.trim()} can now log in with ${form.email.trim()} and the password you set.` })
    } catch (err) {
      const fields = fieldErrors(err)
      setErrors(fields)
      if (!Object.keys(fields).length) setNotice({ tone: 'error', text: errorMessage(err, "We couldn't add that person.") })
    } finally {
      setAdding(false)
    }
  }

  const remove = async (member: TeamMember) => {
    setRemoving(member.id)
    setNotice(null)
    try {
      await teamApi.remove(member.id)
      // Removing frees a seat, which may bring back a paused member: reload.
      setTeam(await teamApi.show())
      setConfirmId(null)
      setNotice({ tone: 'success', text: `${member.name} was removed and can no longer log in.` })
    } catch (err) {
      setNotice({ tone: 'error', text: errorMessage(err, "We couldn't remove that person.") })
    } finally {
      setRemoving(null)
    }
  }

  const activeCount = team?.members.filter((m) => m.active).length ?? 0
  const roomLeft = team !== null && activeCount < team.seats

  return (
    <AppPage title="Team" subtitle="Sub-users log in with their own email and password and work in your setups. They can run lives and edit setups, but can't see stream keys, change the plan or manage the team.">
      {loadError && <Alert>{loadError}</Alert>}
      {!team && !loadError && <Spinner label="Loading your team…" />}
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      {team && (
        <>
          <section aria-labelledby="members-h" className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="members-h" className="m-0 font-display text-xl font-semibold">
                Members
              </h2>
              <span className="text-sm text-muted">
                {activeCount} of {team.seats} seats used · {team.plan_name} plan
              </span>
            </div>

            {team.seats === 0 && team.members.length === 0 && (
              <p className="m-0 text-sm text-text-2">
                Your {team.plan_name} plan is just you. <Link to="/plans">Upgrade your plan</Link> to add sub-users.
              </p>
            )}
            {team.seats > 0 && team.members.length === 0 && <p className="m-0 text-sm text-muted">No sub-users yet. Add one below.</p>}

            {team.members.length > 0 && (
              <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
                {team.members.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-semibold">{m.name}</span>
                      <span className="truncate text-[13px] text-muted">
                        {m.email}
                        {m.added_at && ` · added ${formatDate(m.added_at)}`}
                      </span>
                    </span>
                    <span className={cx('rounded-full px-2.5 py-0.5 text-xs font-semibold', m.active ? 'bg-raised text-select' : 'bg-danger-bg text-danger-text')}>
                      {m.active ? 'Active' : 'Paused'}
                    </span>
                    {confirmId === m.id ? (
                      <span className="flex items-center gap-2">
                        <span className="text-[13px] text-text-2">Remove {m.name}?</span>
                        <Button size="sm" variant="danger" onClick={() => remove(m)} loading={removing === m.id}>
                          Remove
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
                          Keep
                        </Button>
                      </span>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setConfirmId(m.id)}>
                        Remove
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {team.members.some((m) => !m.active) && (
              <p className="m-0 text-[13px] text-muted">
                Paused members can’t log in because your plan has fewer seats. <Link to="/plans">Upgrade</Link> or remove someone to bring them back.
              </p>
            )}
          </section>

          {roomLeft ? (
            <form noValidate onSubmit={add} aria-labelledby="add-h" className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]">
              <h2 id="add-h" className="m-0 font-display text-xl font-semibold">
                Add a sub-user
              </h2>
              <TextField label="Name" value={form.name} maxLength={80} autoComplete="off" error={errors.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              <TextField
                label="Email"
                type="email"
                value={form.email}
                maxLength={254}
                autoComplete="off"
                error={errors.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
              <PasswordField
                label="Password"
                value={form.password}
                maxLength={128}
                autoComplete="new-password"
                hint="At least 8 characters. Share it with them privately; they can change it with “Forgot password”."
                error={errors.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              />
              <Button type="submit" variant="primary" loading={adding} disabled={!form.name.trim() || !form.email.trim() || form.password.length < 8}>
                Add sub-user
              </Button>
            </form>
          ) : (
            team.seats > 0 && (
              <p className="m-0 text-sm text-text-2">
                All {team.seats} seats are in use. <Link to="/plans">Upgrade your plan</Link> to add more people.
              </p>
            )
          )}
        </>
      )}
    </AppPage>
  )
}
