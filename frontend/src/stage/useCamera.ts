import { useCallback, useEffect, useRef, useState } from 'react'
import type { Resolution } from '../lib/types'
import { readLocal, writeLocal } from '../lib/storage'

export type CameraStatus = 'idle' | 'starting' | 'live' | 'denied' | 'not-found' | 'busy' | 'unsupported' | 'error'

type MediaErrorStatus = 'denied' | 'not-found' | 'busy' | 'error'

/** Sound sent with the camera: "off" when it wasn't asked for or the camera is off. */
export type AudioStatus = 'off' | 'live' | MediaErrorStatus

export interface CameraDevice {
  deviceId: string
  label: string
}

// Device ids belong to one browser, so the chosen camera is remembered on this device
// (the setup itself stores the camera's name to find it again elsewhere).
const DEVICE_KEY = 'livesell.camera.deviceId'

// Untouched sound, like OBS's own capture: echo cancelling would fight the clean screen
// playing this sound back, and noise suppression muffles capture-card audio and music.
const RAW_AUDIO: MediaTrackConstraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false }

function statusFromError(error: unknown): MediaErrorStatus {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'not-found'
  if (name === 'NotReadableError' || name === 'AbortError') return 'busy'
  return 'error'
}

export const CAMERA_MESSAGES: Record<CameraStatus, string> = {
  idle: 'Camera is off.',
  starting: 'Starting camera…',
  live: 'Camera is on.',
  denied: 'Camera access was blocked. Allow the camera in your browser’s address bar, then try again.',
  'not-found': 'No camera found. Plug in your webcam or capture card, then try again.',
  busy: 'The camera is in use by another app. Close it there, then try again.',
  unsupported: 'This browser can’t use a camera here. Use Chrome or Edge over https.',
  error: 'The camera could not start. Try again.',
}

export const AUDIO_MESSAGES: Record<Exclude<AudioStatus, 'off' | 'live'>, string> = {
  denied: 'Microphone access was blocked, so your live has no sound. Allow the microphone in your browser’s address bar, then turn the camera on again.',
  'not-found': 'No microphone found, so your live has no sound. Plug one in, then turn the camera on again.',
  busy: 'The microphone is in use by another app, so your live has no sound. Close it there, then turn the camera on again.',
  error: 'The microphone could not start, so your live has no sound. Turn the camera on again to retry.',
}

/**
 * Opens the camera's own microphone (a webcam mic or an HDMI capture card's sound shares
 * the camera's group id), or the default microphone when the camera has none.
 */
async function openCameraAudio(videoTrack: MediaStreamTrack | undefined): Promise<MediaStreamTrack> {
  const open = async (id?: string) => {
    const media = await navigator.mediaDevices.getUserMedia({ audio: { ...RAW_AUDIO, ...(id ? { deviceId: { exact: id } } : {}) } })
    return media.getAudioTracks()[0]
  }

  // Microphones only show their ids once access is allowed, so open the default one first.
  const fallback = await open()
  try {
    const all = await navigator.mediaDevices.enumerateDevices()
    const videoId = videoTrack?.getSettings().deviceId
    const group = all.find((d) => d.kind === 'videoinput' && d.deviceId === videoId)?.groupId
    // Chrome lists "default" and "communications" aliases in the same group as the real device.
    const own = group && all.find((d) => d.kind === 'audioinput' && d.groupId === group && d.deviceId !== 'default' && d.deviceId !== 'communications')
    if (!own || fallback.getSettings().groupId === group) return fallback
    const track = await open(own.deviceId)
    fallback.stop()
    return track
  } catch {
    // The camera's own mic is busy or can't be listed: keep the default microphone.
    return fallback
  }
}

/**
 * Opens a camera with getUserMedia and keeps the list of cameras up to date.
 * Prefers, in order: the camera picked on this device, one whose name matches
 * `preferLabel`, then the browser's default. With `audio`, the stream also carries the
 * camera's sound; if the microphone can't open, the picture still starts without it.
 */
export function useCamera({
  resolution,
  preferLabel,
  autoStart,
  audio = false,
}: {
  resolution: Resolution
  preferLabel?: string | null
  autoStart: boolean
  audio?: boolean
}) {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [audioStatus, setAudioStatus] = useState<AudioStatus>('off')
  const [micLabel, setMicLabel] = useState<string | null>(null)
  const [devices, setDevices] = useState<CameraDevice[]>([])
  const [deviceId, setDeviceId] = useState<string | null>(() => readLocal(DEVICE_KEY))
  const streamRef = useRef<MediaStream | null>(null)
  const requestRef = useRef(0)

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return []
    const all = await navigator.mediaDevices.enumerateDevices()
    const cams = all
      .filter((d) => d.kind === 'videoinput')
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }))
    setDevices(cams)
    return cams
  }, [])

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  // Latest inputs, read when the camera (re)starts.
  const options = useRef({ resolution, preferLabel, audio })
  useEffect(() => {
    options.current = { resolution, preferLabel, audio }
  }, [resolution, preferLabel, audio])

  const start = useCallback(
    async (wantedId?: string | null, quality?: Resolution, withSound?: boolean) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('unsupported')
        return
      }
      const request = ++requestRef.current
      setStatus('starting')
      const { preferLabel: label } = options.current
      const withAudio = withSound ?? options.current.audio
      const [w, h] = (quality ?? options.current.resolution) === '720p' ? [1280, 720] : [1920, 1080]
      const open = (id: string | null) =>
        navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            ...(id ? { deviceId: { exact: id } } : {}),
            width: { ideal: w },
            height: { ideal: h },
            frameRate: { ideal: 30 },
          },
        })

      try {
        let id = wantedId ?? readLocal(DEVICE_KEY)
        let media: MediaStream
        try {
          media = await open(id)
        } catch (error) {
          // The remembered camera is gone: fall back to the default one.
          if (!id || statusFromError(error) !== 'not-found') throw error
          id = null
          media = await open(null)
        }

        // Labels are only readable after permission; switch to the named camera if needed.
        const cams = await refreshDevices()
        if (!id && label) {
          const match = cams.find((c) => c.label === label)
          const current = media.getVideoTracks()[0]?.getSettings().deviceId
          if (match && match.deviceId !== current) {
            media.getTracks().forEach((t) => t.stop())
            media = await open(match.deviceId)
          }
        }

        // Sound is opened once the final camera is known, so its own microphone is picked.
        let nextAudioStatus: AudioStatus = 'off'
        if (withAudio) {
          try {
            media.addTrack(await openCameraAudio(media.getVideoTracks()[0]))
            nextAudioStatus = 'live'
          } catch (error) {
            nextAudioStatus = statusFromError(error)
          }
        }

        if (request !== requestRef.current) {
          media.getTracks().forEach((t) => t.stop())
          return
        }
        stopTracks()
        streamRef.current = media
        const actualId = media.getVideoTracks()[0]?.getSettings().deviceId ?? null
        if (actualId) {
          writeLocal(DEVICE_KEY, actualId)
          setDeviceId(actualId)
        }
        // If the camera is unplugged mid-live, say so instead of freezing.
        media.getVideoTracks()[0]?.addEventListener('ended', () => {
          if (streamRef.current === media) {
            // Release the microphone too, so it isn't left on with no picture.
            stopTracks()
            setStream(null)
            setStatus('not-found')
            setAudioStatus('off')
            setMicLabel(null)
          }
        })
        setStream(media)
        setStatus('live')
        setAudioStatus(nextAudioStatus)
        setMicLabel(media.getAudioTracks()[0]?.label || null)
      } catch (error) {
        if (request !== requestRef.current) return
        setStatus(statusFromError(error))
      }
    },
    [refreshDevices, stopTracks],
  )

  const stop = useCallback(() => {
    requestRef.current++
    stopTracks()
    setStream(null)
    setStatus('idle')
    setAudioStatus('off')
    setMicLabel(null)
  }, [stopTracks])

  const selectDevice = useCallback((id: string) => void start(id), [start])

  // Start on mount when asked, and restart when the quality or sound setting changes
  // (if the camera is on) so it delivers the right size and tracks.
  useEffect(() => {
    if (autoStart || streamRef.current) void start(undefined, resolution, audio)
  }, [autoStart, resolution, audio, start])

  useEffect(() => {
    const onChange = () => void refreshDevices()
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange)
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', onChange)
  }, [refreshDevices])

  useEffect(() => stopTracks, [stopTracks])

  const label = devices.find((d) => d.deviceId === deviceId)?.label ?? null

  return { stream, status, audioStatus, micLabel, devices, deviceId, label, start, stop, selectDevice }
}
