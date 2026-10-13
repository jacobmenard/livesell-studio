import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useBlocker, useParams } from 'react-router'
import { Icon } from '../../components/Icon'
import { Logo } from '../../components/Logo'
import { Alert, Button, Spinner, cx } from '../../components/ui'
import { useLiveSync } from '../../hooks/useLiveSync'
import { useMediaLibrary } from '../../hooks/useMediaLibrary'
import { errorMessage, isStatus } from '../../lib/api'
import { liveApi, setupsApi } from '../../lib/endpoints'
import type { BackgroundSettings, CameraSettings, OutputSettings, ForegroundSettings, Platform, PopupConfig, SetupDocument, SetupFull, SoundRef, SoundSettings, TextColor } from '../../lib/types'
import { MAX_TEXT_LENGTH, POPUP_SIZE, SOUNDS } from '../../stage/catalog'
import type { CompositorStatus } from '../../stage/compositor'
import { activeFromSetup, buildScene, documentForApi, documentFromSetup, newPopupKey, sameDocument, type ActivePopup } from '../../stage/scene'
import { playSound, unlockAudio } from '../../stage/sounds'
import { useCamera } from '../../stage/useCamera'
import { ThemeSwitch } from '../../theme/ThemeSwitch'
import { EDITOR_TOUR } from '../../tour/tours'
import { useTour } from '../../tour/useTour'
import { Walkthrough } from '../../tour/Walkthrough'
import { BackgroundPanel } from './BackgroundPanel'
import { ForegroundPanel } from './ForegroundPanel'
import { CameraPanel } from './CameraPanel'
import { GoLivePanel } from './GoLivePanel'
import { PopupsPanel } from './PopupsPanel'
import { OnScreenBar, PreviewPanel } from './PreviewPanel'
import { SoundBoard, soundPads, type Pad } from './SoundBoard'

type Tab = 'camera' | 'foreground' | 'background' | 'popups' | 'output'

const TABS: { id: Tab; label: string }[] = [
  { id: 'camera', label: 'Camera' },
  { id: 'foreground', label: 'Foreground' },
  { id: 'background', label: 'Background' },
  { id: 'popups', label: 'Popups' },
  { id: 'output', label: 'Go live' },
]

export function EditorPage() {
  const setupId = Number(useParams().id)
  if (!Number.isInteger(setupId) || setupId <= 0) return <SetupNotFound />
  // A new id gets a fresh loader (and fresh state).
  return <EditorLoader key={setupId} setupId={setupId} />
}

function EditorLoader({ setupId }: { setupId: number }) {
  const [setup, setSetup] = useState<SetupFull | null>(null)
  const [loadError, setLoadError] = useState('')
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let cancelled = false
    setupsApi
      .get(setupId)
      .then((s) => {
        if (cancelled) return
        if (s.is_template) setNotFound(true)
        else setSetup(s)
      })
      .catch((e) => {
        if (cancelled) return
        if (isStatus(e, 404)) setNotFound(true)
        else setLoadError(errorMessage(e, "We couldn't open this setup."))
      })
    return () => {
      cancelled = true
    }
  }, [setupId])

  if (notFound) return <SetupNotFound />
  if (loadError) {
    return (
      <CenteredMessage title="Couldn’t open this setup">
        <Alert>{loadError}</Alert>
        <Button onClick={() => window.location.reload()}>Try again</Button>
      </CenteredMessage>
    )
  }
  if (!setup) {
    return (
      <CenteredMessage>
        <Spinner label="Opening your setup…" />
      </CenteredMessage>
    )
  }
  return <Editor initial={setup} />
}

function SetupNotFound() {
  return (
    <CenteredMessage title="Setup not found">
      <p className="m-0 text-muted">It may have been deleted, or it belongs to another account.</p>
      <Link to="/setups">Back to my setups</Link>
    </CenteredMessage>
  )
}

function CenteredMessage({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6 text-text">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <Logo size={36} variant="mark" />
        {title && <h1 className="m-0 font-display text-2xl font-extrabold">{title}</h1>}
        {children}
      </div>
    </main>
  )
}

function Editor({ initial }: { initial: SetupFull }) {
  const setupId = initial.id
  const [doc, setDoc] = useState<SetupDocument>(() => documentFromSetup(initial))
  const [saved, setSaved] = useState<SetupDocument>(() => documentFromSetup(initial))
  const [active, setActive] = useState<ActivePopup[]>(() => activeFromSetup(initial))
  const [selectedKey, setSelectedKey] = useState<string | null>(() => initial.scene.popups.at(-1)?.key ?? 'off10')
  const [tab, setTab] = useState<Tab>('popups')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [playing, setPlaying] = useState<SoundRef | null>(null)
  const [compositorStatus, setCompositorStatus] = useState<CompositorStatus>('ok')
  const [errors, setErrors] = useState<{ popup: string; background: string; foreground: string; sound: string }>({ popup: '', background: '', foreground: '', sound: '' })
  const media = useMediaLibrary()
  // The editor walkthrough starts the first time any setup is opened.
  const tour = useTour('editor', true)
  const hideTimers = useRef(new Map<string, number>())
  const playingTimer = useRef<number | undefined>(undefined)

  // Sound is opened here too, so the microphone is allowed before going live and its name shown.
  const camera = useCamera({ resolution: doc.resolution, preferLabel: doc.camera.device_label, autoStart: false, audio: doc.camera.audio })

  // Start the camera straight away if the seller already allowed it on this device
  // (camera.start is stable, so this runs once).
  const startCamera = camera.start
  useEffect(() => {
    let cancelled = false
    navigator.permissions
      ?.query({ name: 'camera' as PermissionName })
      .then((p) => {
        if (!cancelled && p.state === 'granted') void startCamera()
      })
      .catch(() => {
        /* Permissions API not available (e.g. Firefox): wait for the button. */
      })
    return () => {
      cancelled = true
    }
  }, [startCamera])

  const dirty = !sameDocument(doc, saved)

  // ---- document edits ------------------------------------------------------
  const patchDoc = useCallback((patch: Partial<SetupDocument>) => setDoc((d) => ({ ...d, ...patch })), [])
  const patchCamera = useCallback((patch: Partial<CameraSettings>) => setDoc((d) => ({ ...d, camera: { ...d.camera, ...patch } })), [])
  const patchBackground = useCallback((patch: Partial<BackgroundSettings>) => setDoc((d) => ({ ...d, background: { ...d.background, ...patch } })), [])
  const patchForeground = useCallback((patch: Partial<ForegroundSettings>) => setDoc((d) => ({ ...d, foreground: { ...d.foreground, ...patch } })), [])
  const patchSounds = useCallback((patch: Partial<SoundSettings>) => setDoc((d) => ({ ...d, sound_settings: { ...d.sound_settings, ...patch } })), [])
  const patchOutput = useCallback((patch: Partial<OutputSettings>) => setDoc((d) => ({ ...d, output_settings: { ...d.output_settings, ...patch } })), [])
  const patchPopup = useCallback(
    (key: string, patch: Partial<PopupConfig>) => setDoc((d) => ({ ...d, popups: d.popups.map((p) => (p.key === key ? { ...p, ...patch } : p)) })),
    [],
  )
  // Picking a popup on the preview opens its settings.
  const selectFromPreview = useCallback((key: string) => {
    setSelectedKey(key)
    setTab('popups')
  }, [])

  // ---- sounds --------------------------------------------------------------
  const pads = useMemo(() => soundPads(media.items), [media.items])
  const soundSettings = doc.sound_settings

  const play = useCallback(
    (sound: SoundRef) => {
      unlockAudio()
      window.clearTimeout(playingTimer.current)
      setPlaying(sound)
      playingTimer.current = window.setTimeout(() => setPlaying(null), 1200)
      setErrors((e) => ({ ...e, sound: '' }))

      const mediaId = sound.startsWith('media:') ? Number(sound.slice(6)) : null
      const item = mediaId ? media.items.find((m) => m.id === mediaId) : undefined
      if (soundSettings.monitor) {
        void playSound(item ? { url: item.url } : (sound as (typeof SOUNDS)[number]['id']), soundSettings.volume).then((ok) => {
          if (!ok) setErrors((e) => ({ ...e, sound: 'That sound could not be played in this browser.' }))
        })
      }
      if (soundSettings.to_stream) {
        liveApi.playSound(setupId, sound, soundSettings.volume).catch((e) => setErrors((x) => ({ ...x, sound: errorMessage(e, "That sound didn't reach your live.") })))
      }
    },
    [media.items, setupId, soundSettings.monitor, soundSettings.to_stream, soundSettings.volume],
  )

  // ---- showing and hiding popups -----------------------------------------
  const hide = useCallback((key: string) => {
    window.clearTimeout(hideTimers.current.get(key))
    hideTimers.current.delete(key)
    setActive((a) => a.filter((x) => x.key !== key))
  }, [])

  const show = useCallback(
    (key: string) => {
      const popup = doc.popups.find((p) => p.key === key)
      if (!popup) return
      setActive((a) => [...a.filter((x) => x.key !== key), { key, shownAt: Date.now() }])
      if (popup.sound) play(popup.sound)
      window.clearTimeout(hideTimers.current.get(key))
      if (popup.auto_hide > 0) {
        hideTimers.current.set(
          key,
          window.setTimeout(() => hide(key), popup.auto_hide * 1000),
        )
      }
    },
    [doc.popups, play, hide],
  )

  const toggle = useCallback((key: string) => (active.some((a) => a.key === key) ? hide(key) : show(key)), [active, hide, show])

  const hideAll = useCallback(() => {
    hideTimers.current.forEach((t) => window.clearTimeout(t))
    hideTimers.current.clear()
    setActive([])
  }, [])

  useEffect(() => {
    const timers = hideTimers.current
    return () => {
      timers.forEach((t) => window.clearTimeout(t))
      window.clearTimeout(playingTimer.current)
    }
  }, [])

  // ---- custom popups -------------------------------------------------------
  const addText = (text: string, color: TextColor): string | undefined => {
    const clean = text.trim()
    if (!clean) return 'Type the words for your popup first.'
    if (clean.length > MAX_TEXT_LENGTH) return `Keep it to ${MAX_TEXT_LENGTH} characters.`
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001F\u007F]/.test(clean)) return 'Use letters, numbers and symbols only.'
    const key = newPopupKey('txt')
    const popup: PopupConfig = {
      key,
      kind: 'text',
      preset_key: null,
      label: clean,
      text: clean,
      color,
      media_id: null,
      position: 'mc',
      x: null,
      y: null,
      size: POPUP_SIZE.default,
      entrance: 'pop',
      effect: 'none',
      effect_repeat: 'once',
      auto_hide: 0,
      sound: null,
    }
    setDoc((d) => ({ ...d, popups: [...d.popups, popup] }))
    setSelectedKey(key)
    return undefined
  }

  const uploadPopupImage = async (file: File) => {
    setErrors((e) => ({ ...e, popup: '' }))
    try {
      const item = await media.upload('image', file)
      const key = newPopupKey('img')
      const popup: PopupConfig = {
        key,
        kind: 'image',
        preset_key: null,
        label: item.label,
        text: null,
        color: null,
        media_id: item.id,
        media_url: item.url,
        position: 'mc',
        x: null,
        y: null,
        size: POPUP_SIZE.default,
        entrance: 'pop',
        effect: 'none',
        effect_repeat: 'once',
        auto_hide: 0,
        sound: null,
      }
      setDoc((d) => ({ ...d, popups: [...d.popups, popup] }))
      setSelectedKey(key)
    } catch (e) {
      setErrors((x) => ({ ...x, popup: (e as Error).message }))
    }
  }

  const removePopup = (key: string) => {
    hide(key)
    setDoc((d) => ({ ...d, popups: d.popups.filter((p) => p.key !== key) }))
    setSelectedKey('off10')
  }

  const uploadBackground = async (file: File) => {
    setErrors((e) => ({ ...e, background: '' }))
    try {
      const item = await media.upload('background', file)
      patchBackground({ media_id: item.id, mode: doc.background.mode === 'green' ? 'green' : 'image' })
    } catch (e) {
      setErrors((x) => ({ ...x, background: (e as Error).message }))
    }
  }

  const removeBackground = async (mediaId: number) => {
    setErrors((e) => ({ ...e, background: '' }))
    try {
      await media.remove(mediaId)
      // A setup using it goes back to its built-in background (the server did the same for saved setups).
      const detach = (d: SetupDocument) => (d.background.media_id === mediaId ? { ...d, background: { ...d.background, media_id: null } } : d)
      setDoc(detach)
      setSaved(detach)
    } catch (e) {
      setErrors((x) => ({ ...x, background: errorMessage(e, "That photo couldn't be removed.") }))
    }
  }

  // Foreground images have their own library, apart from popup images; a new one shows straight away.
  const uploadForeground = async (file: File) => {
    setErrors((e) => ({ ...e, foreground: '' }))
    try {
      const item = await media.upload('foreground', file)
      patchForeground({ media_id: item.id, enabled: true })
    } catch (e) {
      setErrors((x) => ({ ...x, foreground: (e as Error).message }))
    }
  }

  const uploadSound = async (file: File) => {
    setErrors((e) => ({ ...e, sound: '' }))
    try {
      await media.upload('sound', file)
    } catch (e) {
      setErrors((x) => ({ ...x, sound: (e as Error).message }))
    }
  }

  const removeSound = async (pad: Pad) => {
    if (pad.mediaId === undefined) return
    try {
      await media.remove(pad.mediaId)
      // Popups that played it now play nothing (the server did the same for saved setups).
      setDoc((d) => ({ ...d, popups: d.popups.map((p) => (p.sound === pad.id ? { ...p, sound: null } : p)) }))
      setSaved((d) => ({ ...d, popups: d.popups.map((p) => (p.sound === pad.id ? { ...p, sound: null } : p)) }))
    } catch (e) {
      setErrors((x) => ({ ...x, sound: errorMessage(e, "That sound couldn't be removed.") }))
    }
  }

  // ---- live picture --------------------------------------------------------
  const scene = useMemo(() => buildScene(doc, active, media.items, camera.label), [doc, active, media.items, camera.label])
  // Wait for the uploads list so image popups aren't dropped from the live picture.
  const sync = useLiveSync(media.loaded ? setupId : null, media.loaded ? scene : null)
  const activeKeys = useMemo(() => new Set(scene.popups.map((p) => p.key)), [scene.popups])

  const openCleanScreen = useCallback(() => {
    const [w, h] = doc.orientation === 'portrait' ? [540, 960] : [960, 540]
    const win = window.open(`/setups/${setupId}/screen`, `negosyowork-screen-${setupId}`, `popup=yes,width=${w},height=${h}`)
    win?.focus()
  }, [doc.orientation, setupId])

  // Streaming records the clean-screen window itself, so open it as large as the screen
  // allows in the right shape: a bigger window is a sharper live.
  const openBroadcast = useCallback(
    (platform: Platform) => {
      const ratio = doc.orientation === 'portrait' ? 9 / 16 : 16 / 9
      const maxH = Math.min(window.screen.availHeight - 80, doc.orientation === 'portrait' ? 1920 : 1080)
      const maxW = Math.min(window.screen.availWidth - 40, doc.orientation === 'portrait' ? 1080 : 1920)
      const h = Math.round(Math.min(maxH, maxW / ratio))
      const w = Math.round(h * ratio)
      const query = new URLSearchParams({ broadcast: platform, quality: doc.resolution })
      const win = window.open(`/setups/${setupId}/screen?${query}`, `negosyowork-screen-${setupId}`, `popup=yes,width=${w},height=${h}`)
      win?.focus()
    },
    [doc.orientation, doc.resolution, setupId],
  )

  // ---- saving --------------------------------------------------------------
  const save = useCallback(async () => {
    if (saving) return
    if (!doc.name.trim()) {
      setSaveError('Give your setup a name first.')
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      // Remember which camera this setup uses (by name, so it can be found on other devices).
      const withCamera = camera.label ? { ...doc, camera: { ...doc.camera, device_label: camera.label } } : doc
      const updated = await setupsApi.save(setupId, documentForApi(withCamera))
      const next = documentFromSetup(updated)
      setDoc(next)
      setSaved(next)
    } catch (e) {
      setSaveError(errorMessage(e, "Your setup wasn't saved. Try again."))
    } finally {
      setSaving(false)
    }
  }, [camera.label, doc, saving, setupId])

  // Ctrl/Cmd+S saves; number and letter keys play sound pads (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void save()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      const pad = SOUNDS.find((s) => s.key === e.key.toUpperCase())
      if (pad) {
        e.preventDefault()
        play(pad.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [play, save])

  // Don't lose unsaved work by closing the tab or leaving the page.
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="on-brand border-b border-white/10 bg-navy text-white">
        <div className="flex flex-wrap items-center gap-4 px-[clamp(16px,3vw,32px)] py-3">
          <Link to="/setups" aria-label="NegosyoWork Studio, my setups" className="inline-flex min-h-11 items-center">
            <Logo size={32} variant="mark" tone="onBrand" />
          </Link>
          <Link to="/setups" className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white/12 py-0 pr-4 pl-3 text-sm font-semibold text-white no-underline transition-[transform,background-color] duration-150 hover:bg-white/20 active:scale-[0.97] motion-reduce:transition-none">
            <Icon name="back" size={16} strokeWidth={2.4} />
            My setups
          </Link>
          <h1 className="m-0 font-display text-[26px] font-extrabold tracking-[-0.03em]">Live Setup</h1>
          <label htmlFor="setup-name" className="sr-only">
            Setup name
          </label>
          <input
            id="setup-name"
            type="text"
            maxLength={60}
            value={doc.name}
            onChange={(e) => patchDoc({ name: e.target.value })}
            className="min-h-11 min-w-0 flex-[0_1_280px] rounded-xl border border-white/20 bg-white/10 px-3.5 text-white transition-colors placeholder:text-white/60 focus:border-white"
          />
          <span className="flex-1" />
          <ThemeSwitch onBrand />
          <Button variant="onBrandSoft" onClick={tour.start} aria-label="Show me around the editor" title="Show me around">
            <Icon name="help" />
            <span className="max-sm:hidden">Tour</span>
          </Button>
          <span role="status" className={cx('text-sm', dirty ? 'text-white' : 'text-white/70')}>
            {saving ? 'Saving…' : dirty ? 'Not saved yet' : 'All changes saved'}
          </span>
          <Button variant="onBrand" onClick={() => void save()} loading={saving} disabled={!dirty && !saving} data-tour="editor-save">
            Save setup
          </Button>
        </div>
        {saveError && (
          <div className="px-[clamp(16px,3vw,32px)] pb-3">
            <Alert>{saveError}</Alert>
          </div>
        )}
      </header>

      <div className="flex flex-wrap items-start gap-6 px-[clamp(16px,3vw,32px)] pt-5 pb-10">
        <main className="flex min-w-0 flex-[1_1_620px] flex-col gap-4">
          <div data-tour="editor-preview">
            <PreviewPanel
              doc={doc}
              scene={scene}
              stream={camera.stream}
              cameraStatus={camera.status}
              onStartCamera={() => void camera.start()}
              compositorStatus={compositorStatus}
              onCompositorStatus={setCompositorStatus}
              playingLabel={playing ? (pads.find((p) => p.id === playing)?.label ?? null) : null}
              onOpenCleanScreen={openCleanScreen}
              selectedKey={selectedKey}
              onSelectPopup={selectFromPreview}
              onChangePopup={patchPopup}
            />
          </div>
          <OnScreenBar scene={scene} onHide={hide} onHideAll={hideAll} />
          <div data-tour="editor-sounds">
            <SoundBoard
              pads={pads}
              settings={doc.sound_settings}
              onSettings={patchSounds}
              playing={playing}
              onPlay={(pad) => play(pad.id)}
              onUpload={uploadSound}
              uploading={media.uploading === 'sound'}
              onRemove={removeSound}
              error={errors.sound}
            />
          </div>
        </main>

        <aside aria-label="Setup controls" className="flex min-w-[300px] flex-[0_1_440px] flex-col gap-3.5">
          {/* Five steps: the number sits above the label so they fit; a very narrow panel wraps to two rows. */}
          <div role="group" aria-label="Setup step" data-tour="editor-steps" className="grid grid-cols-[repeat(auto-fit,minmax(4.75rem,1fr))] gap-1 rounded-[14px] border border-line bg-surface p-1">
            {TABS.map((t, i) => {
              const on = t.id === tab
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={on}
                  data-tour={t.id === 'output' ? 'editor-golive' : undefined}
                  onClick={() => setTab(t.id)}
                  className={cx(
                    'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-[10px] border-0 px-1 py-1 text-[12px] font-semibold whitespace-nowrap',
                    on ? 'bg-raised text-text' : 'bg-transparent text-muted hover:text-text',
                  )}
                >
                  <span className={cx('grid h-5 w-5 place-items-center rounded-full text-[11px]', on ? 'bg-primary text-white' : 'bg-raised text-muted')}>{i + 1}</span>
                  {t.label}
                </button>
              )
            })}
          </div>

          {media.error && <Alert>{media.error}</Alert>}

          {tab === 'camera' && (
            <CameraPanel
              camera={doc.camera}
              orientation={doc.orientation}
              resolution={doc.resolution}
              onCamera={patchCamera}
              onOrientation={(orientation) => patchDoc({ orientation })}
              onResolution={(resolution) => patchDoc({ resolution })}
              devices={camera.devices}
              deviceId={camera.deviceId}
              status={camera.status}
              audioStatus={camera.audioStatus}
              micLabel={camera.micLabel}
              onSelectDevice={camera.selectDevice}
              onStart={() => void camera.start()}
              onStop={camera.stop}
            />
          )}
          {tab === 'foreground' && (
            <ForegroundPanel
              foreground={doc.foreground}
              onChange={patchForeground}
              media={media.items}
              onUpload={uploadForeground}
              uploading={media.uploading === 'foreground'}
              error={errors.foreground}
            />
          )}
          {tab === 'background' && (
            <BackgroundPanel
              background={doc.background}
              onChange={patchBackground}
              media={media.items}
              onUpload={uploadBackground}
              onRemove={removeBackground}
              uploading={media.uploading === 'background'}
              error={errors.background}
            />
          )}
          {tab === 'popups' && (
            <PopupsPanel
              popups={doc.popups}
              activeKeys={activeKeys}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
              onToggle={toggle}
              onChange={patchPopup}
              onRemove={removePopup}
              onAddText={addText}
              onUploadImage={uploadPopupImage}
              uploading={media.uploading === 'image'}
              error={errors.popup}
              media={media.items}
              pads={pads}
            />
          )}
          {tab === 'output' && (
            <GoLivePanel
              setupId={setupId}
              orientation={doc.orientation}
              settings={doc.output_settings}
              onSettings={patchOutput}
              onOpenCleanScreen={openCleanScreen}
              onGoLive={openBroadcast}
              syncState={sync.state}
              syncError={sync.error}
            />
          )}
        </aside>
      </div>

      {tour.open && <Walkthrough steps={EDITOR_TOUR} offerDontShowAgain={tour.offerDontShowAgain} onClose={tour.close} />}

      {blocker.state === 'blocked' && (
        <div role="dialog" aria-modal="true" aria-labelledby="leave-h" className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="flex w-full max-w-sm flex-col gap-4 rounded-[20px] border border-line bg-surface p-6">
            <h2 id="leave-h" className="m-0 font-display text-xl font-semibold">
              Leave without saving?
            </h2>
            <p className="m-0 text-sm text-muted">Your changes to “{doc.name.trim() || 'this setup'}” will be lost.</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button onClick={() => blocker.reset()} autoFocus>
                Stay here
              </Button>
              <Button variant="danger" onClick={() => blocker.proceed()}>
                Leave
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
