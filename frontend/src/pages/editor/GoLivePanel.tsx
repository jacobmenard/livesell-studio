import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { Icon } from '../../components/Icon'
import { Alert, Button, Panel, Segmented, Switch, TextField, cx } from '../../components/ui'
import { errorMessage, fieldErrors } from '../../lib/api'
import { destinationsApi, liveApi, subscriptionApi } from '../../lib/endpoints'
import { editedLabel } from '../../lib/format'
import type { Destination, Orientation, OutputLinkState, OutputMethod, OutputSettings, Platform } from '../../lib/types'
import { checkRtmpServer, checkStreamKey, compact, withoutKey } from '../../lib/validation'
import { isBroadcasting, type BroadcastState, type BroadcastStatus } from '../../stage/broadcast'
import { PLATFORMS } from '../../stage/catalog'
import { platformLabel, useBroadcastWatch } from '../../stage/useBroadcast'
import type { LiveSyncState } from '../../hooks/useLiveSync'

const METHODS: { id: OutputMethod; label: string; sub: string }[] = [
  { id: 'window', label: 'Clean screen for TikTok LIVE Studio or OBS', sub: 'Capture it as a window or Browser Source' },
  { id: 'rtmp', label: 'Stream straight to Facebook or YouTube', sub: 'With a server URL and stream key' },
  { id: 'vcam', label: 'Use it as a camera', sub: 'Shows up as a webcam in any live app' },
]

export function GoLivePanel({
  setupId,
  orientation,
  settings,
  onSettings,
  onOpenCleanScreen,
  onGoLive,
  syncState,
  syncError,
}: {
  setupId: number
  orientation: Orientation
  settings: OutputSettings
  onSettings: (patch: Partial<OutputSettings>) => void
  onOpenCleanScreen: () => void
  /** Opens the clean screen ready to stream straight to a saved destination. */
  onGoLive: (platform: Platform) => void
  syncState: LiveSyncState
  syncError: string
}) {
  const portrait = orientation === 'portrait'
  // The Free plan can set up and preview, but not go live: say so here.
  const [onFree, setOnFree] = useState(false)
  useEffect(() => {
    let cancelled = false
    subscriptionApi
      .show()
      .then((s) => !cancelled && setOnFree(!s.plan.purchasable))
      .catch(() => {
        /* the clean screen explains it too */
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Panel title="Go live" subtitle="Viewers get the clean screen only: camera, background, popups, effects and sounds. These buttons stay here with you." headingId="out-h">
      {onFree && (
        <Alert tone="info">
          You’re on the Free plan: you can preview the clean screen (marked “Preview”), but going live needs a plan. <Link to="/plans">See plans</Link>
        </Alert>
      )}
      <Switch
        checked={settings.safe_zones}
        onChange={(v) => onSettings({ safe_zones: v })}
        label={
          <>
            Show where {portrait ? 'TikTok' : 'Facebook'} covers the screen <span className="text-muted">(preview only)</span>
          </>
        }
      />

      <div role="radiogroup" aria-label="How to send your screen" className="flex flex-col gap-2">
        {METHODS.map((m) => {
          const on = m.id === settings.method
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onSettings({ method: m.id })}
              className={cx('flex min-h-16 items-center gap-3 rounded-[14px] border-2 bg-field px-3.5 py-2.5 text-left text-text', on ? 'border-select' : 'border-line')}
            >
              <span className={cx('grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-2', on ? 'border-select' : 'border-line')}>
                <span className={cx('h-2 w-2 rounded-full', on ? 'bg-select' : 'bg-transparent')} />
              </span>
              <span className="flex flex-1 flex-col leading-tight">
                <span className="font-semibold">{m.label}</span>
                <span className="text-[13px] text-muted">{m.sub}</span>
              </span>
            </button>
          )
        })}
      </div>

      {settings.method === 'window' && (
        <WindowOutput setupId={setupId} portrait={portrait} settings={settings} onSettings={onSettings} onOpenCleanScreen={onOpenCleanScreen} syncState={syncState} syncError={syncError} />
      )}
      {settings.method === 'rtmp' && <RtmpOutput setupId={setupId} onGoLive={onGoLive} />}
      {settings.method === 'vcam' && (
        <div className="flex flex-col gap-3 border-t border-line pt-3.5">
          <p className="m-0 rounded-xl border border-line-strong bg-surface-2 px-3.5 py-2.5 text-[13px] text-text-2">
            “NegosyoWork Studio Camera” needs the NegosyoWork Studio desktop app for Windows or Mac, which is coming soon. Until then, use the clean screen with TikTok LIVE
            Studio or OBS — OBS can also turn it into a webcam with its <strong>Start Virtual Camera</strong> button.
          </p>
          <ol className="m-0 flex flex-col gap-1.5 pl-5 text-[13px] text-text-2">
            <li>Open the clean screen in OBS as a Browser Source.</li>
            <li>Press Start Virtual Camera in OBS.</li>
            <li>In TikTok LIVE Studio, Facebook or Zoom, pick “OBS Virtual Camera”.</li>
          </ol>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 border-t border-line pt-3.5 text-[13px]">
        <div className="flex flex-col gap-1.5">
          <span className="font-semibold">On your live</span>
          {['Camera and background', 'Popups and effects', 'Sound effects'].map((s) => (
            <span key={s} className="flex items-center gap-1.5 text-text-2">
              <Icon name="check" size={14} strokeWidth={2.6} className="text-select" />
              {s}
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="font-semibold">Only you see</span>
          {['Buttons and settings', 'Mouse pointer', 'Safe-zone guides', 'This panel'].map((s) => (
            <span key={s} className="flex items-center gap-1.5 text-text-2">
              <Icon name="close" size={14} strokeWidth={2.4} className="text-muted" />
              {s}
            </span>
          ))}
        </div>
      </div>
    </Panel>
  )
}

function WindowOutput({
  setupId,
  portrait,
  settings,
  onSettings,
  onOpenCleanScreen,
  syncState,
  syncError,
}: {
  setupId: number
  portrait: boolean
  settings: OutputSettings
  onSettings: (patch: Partial<OutputSettings>) => void
  onOpenCleanScreen: () => void
  syncState: LiveSyncState
  syncError: string
}) {
  const [link, setLink] = useState<OutputLinkState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    let cancelled = false
    liveApi
      .outputLink(setupId)
      .then((l) => !cancelled && setLink(l))
      .catch((e) => !cancelled && setError(errorMessage(e)))
    return () => {
      cancelled = true
    }
  }, [setupId])

  useEffect(() => {
    if (copy === 'idle') return
    const t = window.setTimeout(() => setCopy('idle'), 2500)
    return () => window.clearTimeout(t)
  }, [copy])

  const makeLink = async () => {
    setBusy(true)
    setError('')
    try {
      setLink(await liveApi.newOutputLink(setupId))
    } catch (e) {
      setError(errorMessage(e, "We couldn't make a link."))
    } finally {
      setBusy(false)
    }
  }

  const turnOff = async () => {
    setBusy(true)
    setError('')
    try {
      await liveApi.turnOffOutputLink(setupId)
      setLink({ active: false, created_at: null, last_seen_at: null })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const copyLink = async () => {
    if (!link?.url) return
    try {
      await navigator.clipboard.writeText(link.url)
      setCopy('copied')
    } catch {
      setCopy('failed')
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3.5">
      <Button variant="primary" size="lg" onClick={onOpenCleanScreen}>
        <Icon name="external" size={16} strokeWidth={2.2} />
        Open clean screen
      </Button>
      <p className="m-0 text-xs text-muted">
        Opens a window with only your live picture. Capture that window in TikTok LIVE Studio or OBS at {portrait ? '1080 × 1920' : '1920 × 1080'}.
      </p>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold">Browser Source link</span>
        {link?.url ? (
          <>
            <div className="flex gap-2">
              <label htmlFor="out-link" className="sr-only">
                Browser Source link
              </label>
              <input
                id="out-link"
                type="text"
                readOnly
                value={link.url}
                onFocus={(e) => e.currentTarget.select()}
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-field px-3 font-mono text-xs text-text-2"
              />
              <Button onClick={copyLink} className="bg-surface-2">
                {copy === 'copied' ? 'Copied' : 'Copy'}
              </Button>
            </div>
            {copy === 'failed' && <p className="m-0 text-xs text-danger-text">Couldn’t copy. Select the link and copy it yourself.</p>}
            <Alert tone="info">Copy it now: for your safety this link is shown only once. Lost it? Make a new one (the old one stops working).</Alert>
          </>
        ) : link?.active ? (
          <p className="m-0 text-[13px] text-text-2">
            A private link is turned on (made {editedLabel(link.created_at).replace('Edited ', '').toLowerCase()}
            {link.last_seen_at ? `, last used ${editedLabel(link.last_seen_at).replace('Edited ', '').toLowerCase()}` : ''}).
          </p>
        ) : (
          <p className="m-0 text-[13px] text-text-2">Make a private link to add your clean screen to OBS or TikTok LIVE Studio as a Browser Source.</p>
        )}
        <p className="m-0 text-xs text-muted">Anyone with the link can see your screen, so keep it private.</p>
        <Alert tone="info">
          <strong>Your camera won’t show in a Browser Source:</strong> OBS and TikTok LIVE Studio don’t let it open your webcam. For your camera with background and
          face effects, use <strong>Open clean screen</strong> above and add that window as a <strong>Window Capture</strong>. The link is for popups and effects
          over a camera you add in OBS: turn on <strong>See-through background</strong> below.
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={makeLink} loading={busy}>
            {link?.active ? 'Make a new link (old one stops working)' : 'Make a link'}
          </Button>
          {link?.active && (
            <Button size="sm" variant="ghost" onClick={turnOff} disabled={busy}>
              Turn link off
            </Button>
          )}
        </div>
        {error && <Alert>{error}</Alert>}
      </div>

      <Switch
        checked={settings.see_through}
        onChange={(v) => onSettings({ see_through: v })}
        label="See-through background"
        description="Popups and effects only, for when your camera is already in OBS"
      />

      <p role="status" className={cx('m-0 text-xs', syncState === 'error' ? 'text-danger-text' : 'text-muted')}>
        {syncState === 'error'
          ? syncError
          : syncState === 'offline'
            ? 'The live connection is down right now: open clean screens catch up within a few seconds.'
            : syncState === 'synced' || syncState === 'sending'
              ? 'Your clean screen follows this editor live.'
              : ''}
      </p>
    </div>
  )
}

function RtmpOutput({ setupId, onGoLive }: { setupId: number; onGoLive: (platform: Platform) => void }) {
  const { user } = useAuth()
  const broadcast = useBroadcastWatch(setupId)
  const [platform, setPlatform] = useState<Platform>('facebook')
  const [saved, setSaved] = useState<Destination[]>([])
  const [server, setServer] = useState(PLATFORMS[0].server)
  const [key, setKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const def = PLATFORMS.find((p) => p.id === platform) ?? PLATFORMS[0]
  const current = saved.find((d) => d.platform === platform)

  useEffect(() => {
    let cancelled = false
    destinationsApi
      .list()
      .then((list) => {
        if (cancelled) return
        setSaved(list)
        // Show the saved server for the platform that's open (the key itself is never sent back).
        const first = list.find((d) => d.platform === 'facebook')
        if (first) setServer(first.server_url)
      })
      .catch(() => {
        /* No saved destinations to show; the form still works. */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Switching platform clears the key, so one platform's key is never sent to another.
  const pick = (id: Platform) => {
    const next = PLATFORMS.find((p) => p.id === id) ?? PLATFORMS[0]
    const existing = saved.find((d) => d.platform === id)
    setPlatform(id)
    setServer(existing?.server_url ?? next.server)
    setKey('')
    setErrors({})
    setMessage('')
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const next = compact({ server_url: checkRtmpServer(server), stream_key: checkStreamKey(key) })
    setErrors(next)
    setMessage('')
    if (Object.keys(next).length) return
    setBusy(true)
    try {
      const d = await destinationsApi.save(platform, { server_url: server.trim(), stream_key: key.trim() })
      setSaved((prev) => [...prev.filter((x) => x.platform !== platform), d])
      setKey('')
      setShowKey(false)
      setMessage(`Saved. Key ending ${d.key_hint.replace(/•/g, '')} is stored encrypted.`)
    } catch (err) {
      const fields = fieldErrors(err)
      setErrors(fields)
      if (!Object.keys(fields).length) setMessage(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  // A sub-user streams with the owner's saved destination but never sees or changes the key.
  if (user?.is_subuser) {
    return (
      <div className="flex flex-col gap-3 border-t border-line pt-3.5">
        <Segmented label="Platform" size="sm" columns={4} value={platform} onChange={pick} options={PLATFORMS.map((p) => ({ id: p.id, label: p.label }))} />
        <p className="m-0 text-[13px] text-text-2">
          {current ? `Streams to ${user.account_name}’s saved ${def.label} destination (key ending ${current.key_hint.replace(/•/g, '')}).` : `${user.account_name} hasn’t saved a ${def.label} stream key yet.`}{' '}
          Only {user.account_name} can change stream keys.
        </p>
        <BroadcastControls label={def.label} ready={Boolean(current)} live={broadcast.live} onGoLive={() => onGoLive(platform)} onStop={broadcast.stop} />
      </div>
    )
  }

  return (
    <form noValidate onSubmit={save} className="flex flex-col gap-3 border-t border-line pt-3.5">
      <Segmented label="Platform" size="sm" columns={4} value={platform} onChange={pick} options={PLATFORMS.map((p) => ({ id: p.id, label: p.label }))} disabled={busy} />
      <p className="m-0 text-xs text-muted">{def.note}</p>
      <TextField
        label="Server URL"
        type="url"
        autoComplete="off"
        spellCheck={false}
        maxLength={300}
        value={server}
        placeholder="rtmps://…"
        error={errors.server_url}
        className="font-mono text-xs"
        onChange={(e) => (setServer(e.target.value), setErrors((x) => withoutKey(x, 'server_url')))}
      />
      <TextField
        label="Stream key"
        type={showKey ? 'text' : 'password'}
        autoComplete="off"
        spellCheck={false}
        maxLength={300}
        value={key}
        placeholder={current ? `Saved: ${current.key_hint}` : ''}
        error={errors.stream_key}
        hint="Treat it like a password. Don’t show it on screen while you’re live."
        className="font-mono text-xs"
        onChange={(e) => (setKey(e.target.value), setErrors((x) => withoutKey(x, 'stream_key')))}
        trailing={
          <button
            type="button"
            onClick={() => setShowKey((s) => !s)}
            aria-pressed={showKey}
            className="absolute top-1 right-1 bottom-1 rounded-lg border-0 bg-transparent px-2.5 text-xs font-semibold text-link"
          >
            {showKey ? 'Hide' : 'Show'}
          </button>
        }
      />
      {message && <Alert tone={message.startsWith('Saved') ? 'success' : 'error'}>{message}</Alert>}
      <Button type="submit" loading={busy}>
        Save {def.label} destination
      </Button>
      <BroadcastControls
        label={def.label}
        ready={Boolean(current)}
        live={broadcast.live}
        onGoLive={() => onGoLive(platform)}
        onStop={broadcast.stop}
      />
    </form>
  )
}

const BROADCAST_TEXT: Record<BroadcastState, (platform: string) => string> = {
  idle: () => '',
  starting: () => 'In the clean-screen window, click Start streaming and share the tab.',
  connecting: (p) => `Connecting to ${p}…`,
  live: (p) => `● Live on ${p}`,
  ended: (p) => `Your ${p} live has ended.`,
  error: () => '',
}

/** Go live / Stop, with the state of a live running in the clean-screen window. */
function BroadcastControls({
  label,
  ready,
  live,
  onGoLive,
  onStop,
}: {
  label: string
  ready: boolean
  live: { platform: Platform; status: BroadcastStatus } | null
  onGoLive: () => void
  onStop: () => void
}) {
  const state = live?.status.state ?? 'idle'
  const liveLabel = live ? platformLabel(live.platform) : label
  const text = state === 'error' ? (live?.status.message ?? '') : BROADCAST_TEXT[state](liveLabel)
  // Live without sound, or the platform asked to wait and the relay is trying again.
  const note = state === 'live' || state === 'connecting' ? live?.status.message : ''

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3.5">
      <span className="text-[13px] font-semibold">Stream straight from NegosyoWork Studio</span>
      {isBroadcasting(state) ? (
        <Button onClick={onStop}>Stop streaming</Button>
      ) : (
        <Button variant="primary" onClick={onGoLive} disabled={!ready}>
          Go live on {label}
        </Button>
      )}
      {text && (
        <p role="status" className={cx('m-0 text-[13px]', state === 'error' ? 'text-danger-text' : state === 'live' ? 'font-semibold text-select' : 'text-text-2')}>
          {text}
        </p>
      )}
      {note && <p className="m-0 text-[13px] text-danger-text">{note}</p>}
      <p className="m-0 text-xs text-muted">
        {ready ? 'Opens your clean screen; start streaming there and keep that window open while you’re live.' : `Save your ${label} server URL and stream key first.`} Needs
        FFmpeg and the NegosyoWork relay running on this computer (see the README).
      </p>
    </div>
  )
}
