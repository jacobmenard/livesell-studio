import { useEffect, useRef, useState } from 'react'
import { Alert, Button } from '../../components/ui'
import { errorMessage, isStatus } from '../../lib/api'
import { createEcho, watchConnection, type ConnectionState } from '../../lib/echo'
import type { LiveSessionTarget } from '../../lib/endpoints'
import type { BuiltinSoundId, Scene, SoundEvent } from '../../lib/types'
import { isBroadcasting, type BroadcastStatus, type BroadcastTarget } from '../../stage/broadcast'
import { ForegroundLayer, PopupLayer, StageFrame } from '../../stage/Stage'
import { platformLabel, useBroadcast } from '../../stage/useBroadcast'
import { playSound, unlockAudio } from '../../stage/sounds'
import { useLiveSession } from '../../stage/useLiveSession'
import { useCamera } from '../../stage/useCamera'
import { VideoLayer } from '../../stage/VideoLayer'
import { CAMERA_FAILED, CameraHelp } from './CameraHelp'

// Only while the WebSocket is down (normally popups arrive over it at once).
const POLL_MS = 1000

export interface FeedSource {
  /** Loads the current picture (and the private channel to follow). */
  load: () => Promise<{ scene: Scene; channel: string }>
  /** Endpoint that signs the private channel. */
  authEndpoint: string
  /** Where this screen reports that it's live (counts against the plan's limit). */
  live: LiveSessionTarget
}

/**
 * Follows a setup's live picture: loads it, then listens on the private WebSocket
 * channel; while the socket is down it polls instead, so the live never freezes.
 */
function useFeed(source: FeedSource) {
  const [scene, setScene] = useState<Scene | null>(null)
  const [fatal, setFatal] = useState('')
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const [channel, setChannel] = useState<string | null>(null)
  const sourceRef = useRef(source)
  const [soundEvent, setSoundEvent] = useState<{ event: SoundEvent; at: number } | null>(null)

  const refresh = useRef(async () => {
    try {
      const data = await sourceRef.current.load()
      setScene(data.scene)
      setChannel(data.channel)
      setFatal('')
    } catch (e) {
      // Turned-off link or deleted setup: stop. Other errors: keep the last picture and retry.
      if (isStatus(e, 404) || isStatus(e, 401) || isStatus(e, 403)) setFatal(errorMessage(e))
    }
  })

  useEffect(() => {
    void refresh.current()
  }, [])

  useEffect(() => {
    if (!channel) return
    const echo = createEcho(sourceRef.current.authEndpoint)
    if (!echo) {
      setConnection('unavailable')
      return
    }
    const stop = watchConnection(echo, setConnection)
    echo
      .private(channel)
      .listen('.scene.updated', (e: { scene: Scene }) => setScene(e.scene))
      .listen('.sound.played', (e: SoundEvent) => setSoundEvent({ event: e, at: Date.now() }))
      .error(() => setConnection('unavailable'))
    return () => {
      stop()
      echo.leave(channel)
      echo.disconnect()
    }
  }, [channel])

  // Poll while the socket isn't connected (and once right after it reconnects).
  useEffect(() => {
    if (fatal) return
    if (connection === 'connected') {
      void refresh.current()
      return
    }
    const t = window.setInterval(() => void refresh.current(), POLL_MS)
    return () => window.clearInterval(t)
  }, [connection, fatal])

  return { scene, fatal, soundEvent }
}

/**
 * The picture viewers see: no buttons, no text, no pointer. With `broadcast`, it can also
 * stream itself straight to a platform (a start card shows only until streaming begins).
 */
export function CleanScreen({ source, broadcast }: { source: FeedSource; broadcast?: BroadcastTarget }) {
  const { scene, fatal, soundEvent } = useFeed(source)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const live = useBroadcast(broadcast, scene?.orientation ?? null, stageRef)

  useEffect(() => {
    document.documentElement.classList.add('clean-screen')
    document.title = 'NegosyoWork Studio — Clean screen'
    // Audio may need one click in a normal browser window (OBS plays it straight away).
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      document.documentElement.classList.remove('clean-screen')
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  // The streaming window never plays anything out loud: while live its sounds go straight into
  // the stream (see broadcast.ts), and before or after streaming they're simply skipped.
  const streaming = useRef(false)
  useEffect(() => {
    streaming.current = isBroadcasting(live.status.state)
  }, [live.status.state])

  useEffect(() => {
    if (!soundEvent) return
    if (broadcast && !streaming.current) return
    const { sound, url, volume } = soundEvent.event
    void playSound(url ? { url } : (sound as BuiltinSoundId), volume)
  }, [soundEvent, broadcast])

  // An open clean screen is a live: it holds one of the plan's slots while it's open.
  const session = useLiveSession(scene && !fatal ? source.live : null)
  const blocked = session.state === 'limit'
  // Free plan: the seller's own window still shows everything, watermarked.
  const preview = session.state === 'preview'

  // Streaming straight sends the whole picture, so see-through (for OBS) never applies to it.
  const seeThrough = !broadcast && (scene?.see_through ?? true)
  const camera = useCamera({
    resolution: '1080p',
    preferLabel: scene?.camera.device_label ?? null,
    autoStart: scene !== null && !seeThrough && !blocked,
    // The microphone only for streaming straight, which mixes it into the live silently.
    // OBS / TikTok LIVE Studio record the mic themselves: playing it out loud here as well
    // is what put the voice in the live twice (an echo) and let the speakers feed the mic.
    audio: broadcast ? (scene?.camera.audio ?? false) : false,
  })

  // Turned-off link or deleted setup, or the plan's live limit is reached (this screen comes
  // on by itself once another live ends): tell whoever set it up.
  if (fatal || blocked) {
    return (
      <main className="grid h-screen place-items-center bg-[#0D0C10] p-6 text-center font-sans text-[#A7A1B0]" style={{ cursor: 'default' }}>
        <p className="m-0 max-w-sm text-sm">{fatal || session.message}</p>
      </main>
    )
  }

  if (!scene) return <main aria-label="Live output" className="h-screen" />

  return (
    <main aria-label="Live output" className="flex h-screen w-screen items-center justify-center overflow-hidden">
      {broadcast && !preview && !isBroadcasting(live.status.state) && (
        <BroadcastStart platform={platformLabel(broadcast.platform)} status={live.status} onStart={() => live.start(camera.stream)} />
      )}
      <StageFrame orientation={scene.orientation} fill frameRef={stageRef}>
        {!seeThrough && (
          <VideoLayer
            stream={camera.stream}
            orientation={scene.orientation}
            resolution="1080p"
            camera={scene.camera}
            background={scene.background}
            backgroundUrl={scene.background.media_url ?? null}
          />
        )}
        {!seeThrough && CAMERA_FAILED.has(camera.status) && <CameraHelp status={camera.status} browserSource={'token' in source.live} />}
        <ForegroundLayer foreground={scene.foreground} />
        <PopupLayer popups={scene.popups} />
        {preview && <PreviewWatermark message={session.message} />}
      </StageFrame>
    </main>
  )
}

/**
 * The Free plan's clean screen: the full picture, marked as a preview across the stage so it
 * can't be used for a real live (it shows in any capture too).
 */
function PreviewWatermark({ message }: { message: string }) {
  return (
    <div role="status" className="absolute inset-0 z-[6] grid place-items-center overflow-hidden font-sans" style={{ pointerEvents: 'none' }}>
      <span
        aria-hidden="true"
        className="font-display font-extrabold tracking-[0.2em] text-white/35"
        style={{ fontSize: 'calc(var(--u) * 16)', transform: 'rotate(-18deg)', textShadow: '0 2px 12px rgba(0,0,0,0.45)' }}
      >
        PREVIEW
      </span>
      <span className="absolute inset-x-0 bottom-0 bg-black/70 px-4 py-2 text-center text-[13px] text-white">{message}</span>
    </div>
  )
}

/** Shown before streaming starts (and after it ends); gone before anything is shared. */
function BroadcastStart({ platform, status, onStart }: { platform: string; status: BroadcastStatus; onStart: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="broadcast-h" className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 font-sans" style={{ cursor: 'default' }}>
      <div className="flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-line bg-surface p-5 text-text">
        <h1 id="broadcast-h" className="m-0 text-lg font-semibold">
          {status.state === 'ended' ? `Your ${platform} live has ended` : `Go live on ${platform}`}
        </h1>
        {status.state === 'error' && <Alert>{status.message}</Alert>}
        <p className="m-0 text-sm text-text-2">
          Chrome will ask to share this tab: choose <strong>Share</strong>. Your voice and sound effects go straight into the live, so this window stays silent
          (no echo). This card disappears before anything goes live. Keep this window open while you’re live.
        </p>
        <Button variant="primary" size="lg" onClick={onStart}>
          {status.state === 'idle' ? 'Start streaming' : 'Start streaming again'}
        </Button>
      </div>
    </div>
  )
}
