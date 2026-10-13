import { useEffect, useRef } from 'react'
import type { BackgroundSettings, CameraSettings, Orientation, Resolution } from '../lib/types'
import { BACKGROUND_BY_ID, KEY_COLORS } from './catalog'
import { Compositor, type CompositorStatus } from './compositor'
import { MIN_ZOOM, outputSize } from './geometry'

interface VideoLayerProps {
  stream: MediaStream | null
  orientation: Orientation
  resolution: Resolution
  camera: Pick<CameraSettings, 'mirror' | 'brightness' | 'contrast' | 'saturation' | 'warmth' | 'smoothing' | 'zoom'>
  background: BackgroundSettings
  /** URL of the seller's own background photo, when one is picked. */
  backgroundUrl: string | null
  onStatus?: (status: CompositorStatus) => void
}

/** Camera + background, drawn on a canvas that fills the stage. */
export function VideoLayer({ stream, orientation, resolution, camera, background, backgroundUrl, onStatus }: VideoLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const compositorRef = useRef<Compositor | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const statusRef = useRef(onStatus)
  useEffect(() => {
    statusRef.current = onStatus
  }, [onStatus])

  // One compositor for the lifetime of the layer.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const compositor = new Compositor(canvas, (s) => statusRef.current?.(s))
    compositorRef.current = compositor
    compositor.start()

    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.autoplay = true
    videoRef.current = video

    return () => {
      compositor.dispose()
      compositorRef.current = null
      video.srcObject = null
      videoRef.current = null
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    const compositor = compositorRef.current
    if (!video || !compositor) return
    if (stream) {
      video.srcObject = stream
      video.play().catch(() => {
        /* autoplay of a muted camera is always allowed; ignore aborted plays on quick switches */
      })
      compositor.setVideo(video)
    } else {
      video.srcObject = null
      compositor.setVideo(null)
    }
  }, [stream])

  const preset = BACKGROUND_BY_ID[background.preset] ?? BACKGROUND_BY_ID.rack
  const pictureUrl = backgroundUrl ?? preset.src

  useEffect(() => {
    const compositor = compositorRef.current
    if (!compositor) return
    let cancelled = false
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      if (!cancelled) compositor.setBackground(img)
    }
    img.onerror = () => {
      if (!cancelled) compositor.setBackground(null)
    }
    img.src = pictureUrl
    return () => {
      cancelled = true
    }
  }, [pictureUrl])

  const { width, height } = outputSize(orientation, resolution)
  const key = (KEY_COLORS.find((k) => k.id === background.key_color) ?? KEY_COLORS[0]).rgb
  // A zoom-out saved in portrait doesn't apply after switching the setup to landscape.
  const zoom = Math.max(camera.zoom, MIN_ZOOM[orientation])
  // A picture from before these settings existed shows unchanged.
  const { brightness = 50, contrast = 50, saturation = 50, warmth = 50, smoothing = 0 } = camera

  useEffect(() => {
    compositorRef.current?.update({
      width,
      height,
      mode: background.mode,
      mirror: camera.mirror,
      look: { brightness, contrast, saturation, warmth, smoothing },
      zoom,
      keyColor: key,
      similarity: background.similarity,
      smoothness: background.smoothness,
      tone: backgroundUrl ? '#17151C' : preset.tone,
    })
  }, [width, height, background.mode, camera.mirror, brightness, contrast, saturation, warmth, smoothing, zoom, key, background.similarity, background.smoothness, backgroundUrl, preset.tone])

  return <canvas ref={canvasRef} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
}
