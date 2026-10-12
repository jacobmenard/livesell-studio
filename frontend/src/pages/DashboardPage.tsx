import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { AppHeader } from '../components/AppHeader'
import { PageBanner } from '../components/AppPage'
import { Icon } from '../components/Icon'
import { Alert, Button, cx } from '../components/ui'
import { errorMessage } from '../lib/api'
import { setupsApi } from '../lib/endpoints'
import { editedLabel, plural } from '../lib/format'
import type { SetupSummary } from '../lib/types'
import { StageThumbnail } from '../stage/StageThumbnail'
import { dashboardTour } from '../tour/tours'
import { useTour } from '../tour/useTour'
import { Walkthrough } from '../tour/Walkthrough'

type Tab = 'all' | 'mine' | 'templates'
type Sort = 'edited' | 'name'

export function DashboardPage() {
  const navigate = useNavigate()
  const [setups, setSetups] = useState<SetupSummary[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [sort, setSort] = useState<Sort>('edited')
  const [query, setQuery] = useState('')
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [busyId, setBusyId] = useState<number | 'new' | null>(null)
  const [toast, setToast] = useState<{ text: string; tone: 'info' | 'error' } | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const { user } = useAuth()
  // First visit: once the list has loaded (or failed), so the tour points at what's there.
  const tour = useTour('dashboard', setups !== null || loadError !== '')
  const tourSteps = useMemo(() => (user ? dashboardTour(user) : []), [user])

  const notify = useCallback((text: string, tone: 'info' | 'error' = 'info') => {
    window.clearTimeout(toastTimer.current)
    setToast({ text, tone })
    toastTimer.current = window.setTimeout(() => setToast(null), 3500)
  }, [])
  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  const fetchSetups = useCallback(
    () =>
      setupsApi
        .list()
        .then(setSetups)
        .catch((error) => setLoadError(errorMessage(error, "We couldn't load your setups."))),
    [],
  )
  useEffect(() => {
    void fetchSetups()
  }, [fetchSetups])
  const retry = () => {
    setLoadError('')
    void fetchSetups()
  }

  const all = useMemo(() => setups ?? [], [setups])
  const counts = {
    all: all.length,
    mine: all.filter((s) => !s.is_template).length,
    templates: all.filter((s) => s.is_template).length,
  }

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all
      .filter((s) => tab === 'all' || (tab === 'mine' ? !s.is_template : s.is_template))
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .sort((a, b) => {
        if (sort === 'name') return a.name.localeCompare(b.name)
        if (a.is_template !== b.is_template) return a.is_template ? 1 : -1
        return (Date.parse(b.updated_at ?? '') || 0) - (Date.parse(a.updated_at ?? '') || 0)
      })
  }, [all, tab, sort, query])

  const createSetup = async (fromId?: number) => {
    if (busyId) return
    setBusyId(fromId ?? 'new')
    try {
      const setup = await setupsApi.create(fromId ? { from_setup_id: fromId } : {})
      navigate(`/setups/${setup.id}`)
    } catch (error) {
      notify(errorMessage(error, "We couldn't make that setup."), 'error')
      setBusyId(null)
    }
  }

  const duplicate = async (s: SetupSummary) => {
    if (busyId) return
    setBusyId(s.id)
    try {
      const copy = await setupsApi.duplicate(s.id)
      setSetups((prev) => [copy, ...(prev ?? [])])
      if (tab === 'templates') setTab('mine')
      notify(`Saved a copy as “${copy.name}”.`)
    } catch (error) {
      notify(errorMessage(error, "We couldn't copy that setup."), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (s: SetupSummary) => {
    setBusyId(s.id)
    try {
      await setupsApi.remove(s.id)
      setSetups((prev) => (prev ?? []).filter((x) => x.id !== s.id))
      setConfirmId(null)
      notify(`Deleted “${s.name}”.`)
    } catch (error) {
      notify(errorMessage(error, "We couldn't delete that setup."), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const loading = setups === null && !loadError
  const emptyAccount = setups !== null && counts.all === 0

  return (
    <div className="min-h-screen bg-bg text-text">
      <AppHeader />
      <PageBanner
        title="My setups"
        subtitle="Open a saved setup before you go live, or start from a template."
        width="max-w-[1360px]"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="onBrandSoft" size="lg" onClick={tour.start} data-tour="tour-replay">
              <Icon name="help" />
              Show me around
            </Button>
            <Button variant="onBrand" size="lg" onClick={() => createSetup()} loading={busyId === 'new'} data-tour="new-setup">
              {busyId !== 'new' && <Icon name="plus" strokeWidth={2.4} />}
              New setup
            </Button>
          </div>
        }
      />
      <main className="mx-auto flex max-w-[1360px] flex-col gap-6 px-[clamp(16px,3vw,32px)] pt-6 pb-16">

        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Show" data-tour="setup-filters" className="flex gap-1 rounded-[14px] border border-line bg-surface p-1">
            {(
              [
                ['all', 'All'],
                ['mine', 'My setups'],
                ['templates', 'Templates'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={tab === id}
                onClick={() => (setTab(id), setConfirmId(null))}
                className={cx(
                  'inline-flex min-h-10 items-center gap-2 rounded-[10px] border-0 px-3.5 text-sm font-semibold',
                  tab === id ? 'bg-raised text-text' : 'bg-transparent text-muted hover:text-text',
                )}
              >
                {label}
                <span className={cx('rounded-full px-[7px] text-xs', tab === id ? 'bg-field' : 'bg-surface-2')}>{counts[id]}</span>
              </button>
            ))}
          </div>
          <div className="flex min-h-12 flex-[1_1_240px] items-center gap-2.5 rounded-[14px] border border-line bg-surface px-3.5 focus-within:outline-2 focus-within:outline-focus">
            <Icon name="search" className="text-muted" />
            <label htmlFor="search" className="sr-only">
              Search setups
            </label>
            <input
              id="search"
              type="search"
              maxLength={60}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search setups by name"
              className="min-w-0 flex-1 border-0 bg-transparent text-text outline-none placeholder:text-muted"
            />
          </div>
          <div role="group" aria-label="Sort by" className="flex gap-1 rounded-[14px] border border-line bg-surface p-1">
            {(
              [
                ['edited', 'Last edited'],
                ['name', 'Name A–Z'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={sort === id}
                onClick={() => setSort(id)}
                className={cx('min-h-10 rounded-[10px] border-0 px-3.5 text-sm font-semibold', sort === id ? 'bg-raised text-text' : 'bg-transparent text-muted hover:text-text')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div aria-live="polite">
          {toast && (
            <Alert tone={toast.tone === 'error' ? 'error' : 'info'} className="inline-block">
              {toast.text}
            </Alert>
          )}
        </div>

        {loadError && (
          <div className="flex flex-col items-start gap-3">
            <Alert>{loadError}</Alert>
            <Button onClick={retry}>Try again</Button>
          </div>
        )}

        {loading && (
          <div aria-busy="true" aria-label="Loading your setups" className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))' }}>
            {[1, 2, 3, 4, 5, 6].map((k) => (
              <div key={k} className="flex flex-col gap-3 overflow-hidden rounded-[18px] border border-line bg-surface pb-4">
                <div className="skeleton aspect-video" />
                <div className="skeleton mx-4 h-[18px] w-3/5 rounded-md" />
                <div className="skeleton mx-4 h-3.5 w-4/5 rounded-md" />
              </div>
            ))}
          </div>
        )}

        {emptyAccount && (
          <div data-tour="setup-list" className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-line-strong px-6 py-16 text-center">
            <h2 className="m-0 font-display text-2xl font-semibold">No setups yet</h2>
            <p className="m-0 max-w-[420px] text-muted">Make your first one: pick your camera, a background, your popups and sounds, then save it here.</p>
            <Button variant="primary" size="lg" onClick={() => createSetup()} loading={busyId === 'new'}>
              Create a setup
            </Button>
          </div>
        )}

        {setups !== null && !emptyAccount && items.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-line-strong px-6 py-12 text-center">
            <p className="m-0 text-muted">{query.trim() ? `No setups match “${query.trim()}”.` : 'Nothing here yet.'}</p>
            {query.trim() && (
              <Button onClick={() => setQuery('')}>
                Clear search
              </Button>
            )}
          </div>
        )}

        {items.length > 0 && (
          <ul data-tour="setup-list" className="m-0 grid list-none gap-5 p-0" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))' }}>
            {items.map((s) => (
              <SetupCard
                key={s.id}
                setup={s}
                busy={busyId === s.id}
                confirming={confirmId === s.id}
                onOpen={() => (s.is_template ? createSetup(s.id) : navigate(`/setups/${s.id}`))}
                onDuplicate={() => duplicate(s)}
                onAskDelete={() => setConfirmId(s.id)}
                onCancelDelete={() => setConfirmId(null)}
                onConfirmDelete={() => remove(s)}
              />
            ))}
          </ul>
        )}
      </main>
      {tour.open && tourSteps.length > 0 && <Walkthrough steps={tourSteps} onClose={tour.close} />}
    </div>
  )
}

function SetupCard({
  setup,
  busy,
  confirming,
  onOpen,
  onDuplicate,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  setup: SetupSummary
  busy: boolean
  confirming: boolean
  onOpen: () => void
  onDuplicate: () => void
  onAskDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}) {
  const mine = !setup.is_template
  const meta = [
    setup.background_label,
    setup.orientation === 'portrait' ? 'Portrait 9:16' : 'Landscape 16:9',
    plural(setup.scene.popups.length, 'popup'),
    plural(setup.linked_sounds, 'sound'),
  ].join(' · ')

  return (
    <li className="flex flex-col overflow-hidden rounded-[18px] border border-line bg-surface transition-colors hover:border-line-hover">
      <div className="relative">
        <StageThumbnail scene={setup.scene} />
        {!mine && <span className="absolute top-2.5 left-2.5 rounded-md bg-cream px-2 py-0.5 text-xs font-semibold text-ink">Template</span>}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-4 pt-3.5 pb-4">
        <h2 className="m-0 text-[17px] leading-snug font-semibold">{setup.name}</h2>
        <p className="m-0 text-[13px] text-muted">{meta}</p>
        <p className="m-0 text-[13px] text-muted">{mine ? editedLabel(setup.updated_at) : (setup.description ?? '')}</p>
        <span className="flex-1" />
        {confirming ? (
          <div role="alert" className="mt-1.5 flex flex-col gap-2 rounded-xl bg-danger-bg px-3 py-2.5">
            <span className="text-[13px] text-danger-text">Delete “{setup.name}”? This can’t be undone.</span>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={onCancelDelete}>
                Keep it
              </Button>
              <Button size="sm" variant="danger" className="flex-1" loading={busy} onClick={onConfirmDelete}>
                Delete
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-1.5 flex gap-2">
            <Button variant={mine ? 'primary' : 'secondary'} className="flex-1" onClick={onOpen} loading={busy && !mine}>
              {mine ? 'Open' : 'Use template'}
            </Button>
            <button
              type="button"
              onClick={onDuplicate}
              disabled={busy}
              aria-label={`Duplicate ${setup.name}`}
              className="grid h-11 w-11 place-items-center rounded-xl border border-line-strong bg-transparent text-text disabled:opacity-60"
            >
              <Icon name="copy" />
            </button>
            {mine && (
              <button
                type="button"
                onClick={onAskDelete}
                aria-label={`Delete ${setup.name}`}
                className="grid h-11 w-11 place-items-center rounded-xl border border-line-strong bg-transparent text-danger-text"
              >
                <Icon name="trash" />
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  )
}
