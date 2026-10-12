import { errorMessage } from '../lib/api'
import { broadcastApi } from '../lib/endpoints'
import type { Orientation, Platform, Resolution } from '../lib/types'

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
  onStatus: (status: BroadcastStatus) => void
}

/**
 * Starts streaming. Call it from a click: Chrome asks the seller to share this tab.
 * Returns a function that stops the live (safe to call at any point, even mid-start).
 */
export function startBroadcast(options: BroadcastOptions): () => void {
  let finished = false
  let capture: MediaStream | null = null
  let socket: WebSocket | null = null
  let recorder: MediaRecorder | null = null
  let silence: AudioContext | null = null

  const report = (state: BroadcastState, message = '') => {
    if (finished) return
    if (state === 'ended' || state === 'error') finished = true
    options.onStatus({ state, message })
  }

  const release = () => {
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    capture?.getTracks().forEach((t) => t.stop())
    void silence?.close()
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
        audio: { suppressLocalAudioPlayback: false } as MediaTrackConstraints,
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

    const tracks: MediaStreamTrack[] = [video, ...capture.getAudioTracks()]
    const withSound = tracks.length > 1
    if (!withSound) {
      // Tab audio wasn't shared: send silence, since platforms expect a sound track.
      silence = new AudioContext()
      tracks.push(silence.createMediaStreamDestination().stream.getAudioTracks()[0])
    }
    const media = new MediaStream(tracks)

    let ticket: string
    try {
      ticket = await broadcastApi.start(options.setupId, { platform: options.platform, orientation: options.orientation, resolution: options.resolution })
    } catch (error) {
      return fail(errorMessage(error, 'The app couldn’t start streaming. Try again.'))
    }
    if (finished) return release()

    report('connecting')
    const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${scheme}//${window.location.host}/relay?ticket=${encodeURIComponent(ticket)}`)
    socket = ws
    let opened = false

    const record = () => {
      recorder = new MediaRecorder(media, { mimeType, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 128_000 })
      recorder.ondataavailable = (event) => {
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
      else if (message.state === 'live') report('live', withSound ? '' : 'You’re live without sound: tab audio wasn’t shared.')
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
