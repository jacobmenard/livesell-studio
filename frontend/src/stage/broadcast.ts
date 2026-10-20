import { errorMessage } from '../lib/api'
import { broadcastApi } from '../lib/endpoints'
import type { Orientation, Platform, Resolution } from '../lib/types'
import { routeSoundsToLive, soundContext, unlockAudio } from './sounds'

/**
 * Streaming straight to Facebook / YouTube. Browsers can't speak RTMP, so the clean
 * screen shares its own tab (cropped to the stage: camera, background, popups, effects
 * and sound), records it, and sends the recording to the local relay (relay/), which
 * publishes it with FFmpeg. The stream key never comes to the browser.
 */

export type BroadcastState = 'idle' | 'starting' | 'connecting' | 'live' | 'ended' | 'error'

export interface BroadcastStatus {
  state: BroadcastState
  message: string
}

export interface BroadcastTarget {
  setupId: number
  platform: Platform
  resolution: Resolution
}

/** Messages between the editor and the clean-screen window streaming the live. */
export type BroadcastMessage = { type: 'status'; platform: Platform; status: BroadcastStatus } | { type: 'stop' } | { type: 'ask' }

export const broadcastChannelName = (setupId: number) => `negosyowork-broadcast-${setupId}`

export const isBroadcasting = (state: BroadcastState) => state === 'starting' || state === 'connecting' || state === 'live'

/** Recording formats to try, best first; the relay re-encodes for the platform either way. */
const MIME_TYPES = ['video/webm;codecs=h264,opus', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']

export function pickMimeType(isSupported: (type: string) => boolean): string | null {
  return MIME_TYPES.find(isSupported) ?? null
}

// Small chunks keep the relay (and so the platform) close behind the picture.
const CHUNK_MS = 250
// No recorded data this long after recording starts: something stopped it (see record()).
const NO_RECORDING_MS = 10_000
// If sending to the relay backs up this far (≈ 10 s of video), stop rather than fall ever further behind.
const MAX_BUFFERED_BYTES = 12 * 1024 * 1024

// Chrome's Region Capture and current-tab capture options aren't in TypeScript's DOM types yet.
type CropTargetApi = { fromElement(element: Element): Promise<unknown> }
type CroppableTrack = MediaStreamTrack & { cropTo?: (target: unknown) => Promise<void> }
type TabCaptureOptions = DisplayMediaStreamOptions & {
  preferCurrentTab?: boolean
  selfBrowserSurface?: 'include' | 'exclude'
  surfaceSwitching?: 'include' | 'exclude'
  systemAudio?: 'include' | 'exclude'
}

export interface BroadcastOptions extends BroadcastTarget {
  orientation: Orientation
  /** The stage element: the shared tab is cropped to it, so nothing else on the page goes live. */
  stage: HTMLElement
  /**
   * The camera's sound. It's mixed straight into the live, never played out loud: a mic
   * that hears its own playback is what makes an echo.
   */
  mic: MediaStream | null
  onStatus: (status: BroadcastStatus) => void
}

/**
 * Starts streaming. Call it from a click: Chrome asks the seller to share this tab.
 * Returns a function that stops the live (safe to call at any point, even mid-start).
 */
export function startBroadcast(options: BroadcastOptions): () => void {
  // The live's sound is mixed on the sound engine, and Chrome only lets it start during a
  // click: now, before the share-this-tab picker uses that click up. While it's suspended,
  // Chrome's recorder waits for sound and records nothing at all (no video either).
  unlockAudio()
  let finished = false
  let capture: MediaStream | null = null
  let socket: WebSocket | null = null
  let recorder: MediaRecorder | null = null
  let voiceSource: MediaStreamAudioSourceNode | null = null
  let silence: ConstantSourceNode | null = null
  // Only closed when this live made its own (the shared sound engine stays open).
  let ownMixer: AudioContext | null = null

  const report = (state: BroadcastState, message = '') => {
    if (finished) return
    if (state === 'ended' || state === 'error') finished = true
    options.onStatus({ state, message })
  }

  const release = () => {
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    capture?.getTracks().forEach((t) => t.stop())
    routeSoundsToLive(null)
    voiceSource?.disconnect()
    silence?.stop()
    silence?.disconnect()
    void ownMixer?.close()
    if (socket && socket.readyState <= WebSocket.OPEN) socket.close(1000)
  }

  const fail = (message: string) => {
    report('error', message)
    release()
  }

  const stop = () => {
    if (finished) return
    report('ended')
    if (recorder && recorder.state !== 'inactive') {
      // Send the last chunk first, then close: the relay ends the live cleanly.
      recorder.onstop = release
      recorder.stop()
    } else {
      release()
    }
  }

  const run = async () => {
    const mimeType = typeof MediaRecorder === 'undefined' ? null : pickMimeType((t) => MediaRecorder.isTypeSupported(t))
    if (!navigator.mediaDevices?.getDisplayMedia || !mimeType) {
      return fail('Streaming straight to a platform needs Chrome or Edge on a computer.')
    }
    report('starting')

    try {
      capture = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 30 } },
        // No tab audio: the voice and sound effects are mixed straight into the live below, and
        // this window plays nothing out loud, so there's nothing for the mic to hear again.
        audio: false,
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
        surfaceSwitching: 'exclude',
        systemAudio: 'exclude',
      } as TabCaptureOptions)
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === 'NotAllowedError'
      return fail(cancelled ? 'Streaming didn’t start: sharing this tab was cancelled.' : 'Chrome couldn’t share this tab. Try again.')
    }
    if (finished) return release()

    const [video] = capture.getVideoTracks()
    if (!video || video.getSettings().displaySurface !== 'browser') {
      return fail('Share this tab (“NegosyoWork Studio — Clean screen”) so your popups and sound go live too.')
    }
    // Chrome's "Stop sharing" bar ends the live too.
    video.addEventListener('ended', stop)

    const CropTarget = (window as unknown as { CropTarget?: CropTargetApi }).CropTarget
    const croppable = video as CroppableTrack
    if (CropTarget && croppable.cropTo) {
      try {
        await croppable.cropTo(await CropTarget.fromElement(options.stage))
      } catch {
        /* the whole tab is sent instead; the relay still fits it to the frame */
      }
    }

    // One sound track for the live, mixed here: the camera's sound, plus the sound effects,
    // which play into this mix instead of the speakers while streaming (sounds.ts). Mixing on
    // the sound effects' own engine is what lets them join. Silence if there's neither, since
    // platforms expect a sound track.
    const voice = options.mic?.getAudioTracks().filter((t) => t.readyState === 'live') ?? []
    const shared = soundContext()
    const mixer = shared ?? new AudioContext()
    if (!shared) ownMixer = mixer
    if (mixer.state !== 'running') {
      // A resume Chrome doesn't allow stays pending, so don't wait for it forever.
      await Promise.race([mixer.resume(), new Promise((resolve) => setTimeout(resolve, 2000))])
    }
    if (finished) return release()
    if (mixer.state !== 'running') {
      return fail('Chrome didn’t let the live’s sound start, so nothing could be recorded. Click Start streaming again.')
    }
    const bus = mixer.createMediaStreamDestination()
    // A steady silent signal under everything. With nothing else in the mix (camera sound off,
    // no effect played yet) the sound track carries no audio at all, and Chrome's recorder then
    // waits for it and records nothing, not even the picture: the relay got no video.
    silence = mixer.createConstantSource()
    const mute = mixer.createGain()
    mute.gain.value = 0
    silence.connect(mute).connect(bus)
    silence.start()
    if (voice.length > 0) {
      voiceSource = mixer.createMediaStreamSource(new MediaStream(voice))
      voiceSource.connect(bus)
    }
    if (shared) routeSoundsToLive(bus)
    const soundNote = voice.length > 0 ? '' : 'You’re live without your voice: camera sound is off (Camera → Sound). Sound effects still go live.'
    const media = new MediaStream([video, ...bus.stream.getAudioTracks()])

    let ticket: string
    try {
      ticket = await broadcastApi.start(options.setupId, { platform: options.platform, orientation: options.orientation, resolution: options.resolution })
    } catch (error) {
      return fail(errorMessage(error, 'The app couldn’t start streaming. Try again.'))
    }
    if (finished) return release()

    report('connecting')
    // The relay sits next to the API (its own subdomain in production), else on this page's host.
    const relay = new URL('/relay', import.meta.env.VITE_API_URL || window.location.origin)
    relay.protocol = relay.protocol === 'https:' ? 'wss:' : 'ws:'
    relay.searchParams.set('ticket', ticket)
    const ws = new WebSocket(relay.href)
    socket = ws
    let opened = false

    const record = () => {
      recorder = new MediaRecorder(media, { mimeType, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 128_000 })
      // Recording normally starts within a second; never wait silently for a live that isn't coming.
      let recording = false
      window.setTimeout(() => {
        if (!recording && !finished) fail('Nothing was recorded from this window. Keep it open and in front, then click Start streaming again.')
      }, NO_RECORDING_MS)
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recording = true
        if (event.data.size === 0 || ws.readyState !== WebSocket.OPEN) return
        if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
          fail('This computer can’t keep up with streaming. Close other apps or choose 720p, then try again.')
          return
        }
        ws.send(event.data)
      }
      recorder.onerror = () => fail('Recording the clean screen stopped unexpectedly. Start streaming again.')
      recorder.start(CHUNK_MS)
    }

    ws.onopen = () => {
      opened = true
    }
    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return
      let message: { type?: string; state?: string; message?: string }
      try {
        message = JSON.parse(event.data)
      } catch {
        return
      }
      if (message.type !== 'status') return
      if (message.state === 'ready' && !recorder && !finished) record()
      // The platform refused the stream for now; the relay keeps the recording and tries again.
      else if (message.state === 'connecting' && !finished) report('connecting', message.message ?? '')
      else if (message.state === 'live') report('live', soundNote)
      else if (message.state === 'error') fail(message.message || 'Streaming stopped.')
      else if (message.state === 'ended') stop()
    }
    ws.onclose = () => {
      if (!finished) {
        fail(opened ? 'The connection to the streaming relay was lost. Start streaming again.' : 'Can’t reach the streaming relay. Start it with “npm start” in the relay folder, then try again.')
      }
    }
  }

  void run()
  return stop
}
