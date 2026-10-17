import { useEffect, useRef } from 'react'
import type { BackgroundSettings, CameraSettings, Orientation, Resolution } from '../lib/types'
import { BACKGROUND_BY_ID, KEY_COLORS } from './catalog'
import { Compositor, type CompositorStatus } from './compositor'
import { isFaceEffect } from './faceEffects'
import { MIN_ZOOM, outputSize } from './geometry'

interface VideoLayerProps {
  stream: MediaStream | null
  orientation: Orientation
  resolution: Resolution
  camera: Pick<CameraSettings, 'mirror' | 'brightness' | 'contrast' | 'saturation' | 'warmth' | 'smoothing' | 'effect' | 'zoom'>
  background: BackgroundSettings
  /** URL of the seller's own background photo, when one is picked. */
  backgroundUrl: string | null
  onStatus?: (status: CompositorStatus) => void
}

/**
 * Camera + background filling the stage. The camera (and the seller cut out of it) is drawn on
 * a canvas; a background picture sits behind it as a plain image, so animated GIFs play (a
 * canvas only ever gets a GIF's first frame).
 */
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
  const showsPicture = background.mode === 'image' || background.mode === 'green'

  const { width, height } = outputSize(orientation, resolution)
  const key = (KEY_COLORS.find((k) => k.id === background.key_color) ?? KEY_COLORS[0]).rgb
  // A zoom-out saved in portrait doesn't apply after switching the setup to landscape.
  const zoom = Math.max(camera.zoom, MIN_ZOOM[orientation])
  // A picture from before these settings existed shows unchanged.
  const { brightness = 50, contrast = 50, saturation = 50, warmth = 50, smoothing = 0 } = camera
  // An unknown effect (e.g. from a newer app version) shows nothing rather than breaking.
  const faceEffect = camera.effect && isFaceEffect(camera.effect) ? camera.effect : 'none'

  useEffect(() => {
    compositorRef.current?.update({
      width,
      height,
      mode: background.mode,
      mirror: camera.mirror,
      look: { brightness, contrast, saturation, warmth, smoothing },
      faceEffect,
      zoom,
      keyColor: key,
      similarity: background.similarity,
      smoothness: background.smoothness,
    })
  }, [width, height, background.mode, camera.mirror, brightness, contrast, saturation, warmth, smoothing, faceEffect, zoom, key, background.similarity, background.smoothness])

  return (
    <>
      {showsPicture && (
        // Filled edge to edge (cropped, never stretched), on its tone while it loads.
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundColor: backgroundUrl ? '#17151C' : preset.tone }}>
          <img src={pictureUrl} alt="" draggable={false} style={{ display: 'block', width: '100%', height: '100%', maxWidth: 'none', objectFit: 'cover' }} />
        </div>
      )}
      <canvas ref={canvasRef} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
    </>
  )
}
