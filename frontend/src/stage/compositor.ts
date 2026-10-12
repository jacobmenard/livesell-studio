import type { ImageSegmenter } from '@mediapipe/tasks-vision'
import type { BackgroundMode } from '../lib/types'
import { ChromaKeyer } from './chroma'
import { coverCrop, maskAlpha, placeCamera, type CameraPlacement } from './geometry'
import { loadSegmenter } from './segmenter'

export interface CompositorSettings {
  width: number
  height: number
  mode: BackgroundMode
  mirror: boolean
  /** 0–100, 50 = unchanged. */
  brightness: number
  /** −100–100: 0 fills the stage, above zooms in, below zooms out (see placeCamera). */
  zoom: number
  keyColor: [number, number, number]
  similarity: number
  smoothness: number
  /** Solid color shown behind everything when there is no picture yet. */
  tone: string
}

/** What the seller should know about background removal (never shown to viewers). */
export type CompositorStatus = 'ok' | 'loading-segmentation' | 'segmentation-unavailable' | 'chroma-unavailable'

/**
 * Draws the camera with its background treatment into a canvas, every frame:
 * None (as is), Blur (soft room), Picture (person cut out over a picture) or
 * Green screen (keyed over a picture). If background removal can't run, it falls
 * back to the plain camera rather than hiding the seller.
 */
export class Compositor {
  private ctx: CanvasRenderingContext2D
  private person = document.createElement('canvas')
  private personCtx: CanvasRenderingContext2D
  private mask = document.createElement('canvas')
  private maskCtx: CanvasRenderingContext2D
  private maskData: ImageData | null = null
  private hasMask = false
  private video: HTMLVideoElement | null = null
  private background: HTMLImageElement | null = null
  private settings: CompositorSettings | null = null
  private segmenter: ImageSegmenter | null = null
  private segmenterState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle'
  private chroma: ChromaKeyer | null = null
  private chromaFailed = false
  private lastVideoTime = -1
  private lastTimestamp = 0
  private frame = 0
  private status: CompositorStatus = 'ok'
  private disposed = false
  private readonly canvas: HTMLCanvasElement
  private readonly onStatus: (status: CompositorStatus) => void

  constructor(canvas: HTMLCanvasElement, onStatus: (status: CompositorStatus) => void = () => {}) {
    this.canvas = canvas
    this.onStatus = onStatus
    const ctx = canvas.getContext('2d', { alpha: true })
    const personCtx = this.person.getContext('2d')
    const maskCtx = this.mask.getContext('2d')
    if (!ctx || !personCtx || !maskCtx) throw new Error('Canvas 2D is not available')
    this.ctx = ctx
    this.personCtx = personCtx
    this.maskCtx = maskCtx
  }

  setVideo(video: HTMLVideoElement | null): void {
    this.video = video
    this.hasMask = false
    this.lastVideoTime = -1
  }

  setBackground(image: HTMLImageElement | null): void {
    this.background = image
  }

  update(settings: CompositorSettings): void {
    this.settings = settings
    if (this.canvas.width !== settings.width || this.canvas.height !== settings.height) {
      this.canvas.width = settings.width
      this.canvas.height = settings.height
    }
    if (this.person.width !== settings.width || this.person.height !== settings.height) {
      this.person.width = settings.width
      this.person.height = settings.height
    }
    if ((settings.mode === 'blur' || settings.mode === 'image') && this.segmenterState === 'idle') {
      this.loadSegmentation()
    }
    if (settings.mode === 'green' && !this.chroma && !this.chromaFailed) {
      try {
        this.chroma = new ChromaKeyer()
      } catch {
        this.chromaFailed = true
      }
    }
    this.refreshStatus()
  }

  start(): void {
    const loop = () => {
      if (this.disposed) return
      try {
        this.draw()
      } catch (error) {
        // A bad frame (e.g. camera unplugged mid-draw) must not stop the stage.
        console.warn('[stage] frame skipped', error)
      }
      this.frame = requestAnimationFrame(loop)
    }
    this.frame = requestAnimationFrame(loop)
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.frame)
    this.chroma?.dispose()
  }

  private loadSegmentation(): void {
    this.segmenterState = 'loading'
    this.refreshStatus()
    loadSegmenter()
      .then((segmenter) => {
        if (this.disposed) return
        this.segmenter = segmenter
        this.segmenterState = 'ready'
        this.refreshStatus()
      })
      .catch((error) => {
        console.warn('[stage] background removal unavailable', error)
        this.segmenterState = 'failed'
        this.refreshStatus()
      })
  }

  private refreshStatus(): void {
    const mode = this.settings?.mode
    let next: CompositorStatus = 'ok'
    if (mode === 'blur' || mode === 'image') {
      if (this.segmenterState === 'loading') next = 'loading-segmentation'
      if (this.segmenterState === 'failed') next = 'segmentation-unavailable'
    } else if (mode === 'green' && this.chromaFailed) {
      next = 'chroma-unavailable'
    }
    if (next !== this.status) {
      this.status = next
      this.onStatus(next)
    }
  }

  private draw(): void {
    const s = this.settings
    if (!s) return
    const { ctx } = this
    const W = this.canvas.width
    const H = this.canvas.height
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.filter = 'none'
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, W, H)

    const video = this.video
    const live = video !== null && video.readyState >= 2 && video.videoWidth > 0

    // 1. What is behind the seller.
    if (s.mode === 'image' || s.mode === 'green') {
      this.drawPicture(W, H, s.tone)
    } else if (!live) {
      ctx.fillStyle = '#2A2730'
      ctx.fillRect(0, 0, W, H)
    }
    if (!live || !video) return

    const place = placeCamera(video.videoWidth, video.videoHeight, W, H, s.zoom)
    const brightness = `brightness(${(0.5 + s.brightness / 100).toFixed(2)})`

    ctx.save()
    if (s.mirror) {
      ctx.translate(W, 0)
      ctx.scale(-1, 1)
    }

    switch (s.mode) {
      case 'none':
        // Zoomed out past the stage edges: fill around the camera with a soft copy of it.
        if (place.dst[2] < W || place.dst[3] < H) this.drawBlurredRoom(video, W, H, brightness, 0)
        ctx.filter = brightness
        ctx.drawImage(video, ...place.src, ...place.dst)
        break
      case 'blur':
        this.drawBlurredRoom(video, W, H, brightness, s.zoom)
        if (this.updateMask(video)) this.drawPerson(video, place, W, H, brightness)
        break
      case 'image':
        if (this.updateMask(video)) {
          this.drawPerson(video, place, W, H, brightness)
        } else {
          // Removal still loading or unavailable: never hide the seller.
          ctx.filter = brightness
          ctx.drawImage(video, ...place.src, ...place.dst)
        }
        break
      case 'green': {
        const keyed = this.chroma?.render(video, s.keyColor, s.similarity, s.smoothness)
        ctx.filter = brightness
        ctx.drawImage(keyed ?? video, ...place.src, ...place.dst)
        break
      }
    }
    ctx.restore()
  }

  /** The camera softly blurred across the whole stage (Blur mode, and the fill around a zoomed-out camera). */
  private drawBlurredRoom(video: HTMLVideoElement, W: number, H: number, brightness: string, zoom: number): void {
    const { ctx } = this
    ctx.filter = `blur(${Math.max(4, Math.round(W / 90))}px) ${brightness}`
    // Overscan slightly so the blur doesn't show soft dark edges.
    const pad = W * 0.04
    ctx.drawImage(video, ...coverCrop(video.videoWidth, video.videoHeight, W, H, zoom), -pad, -pad, W + pad * 2, H + pad * 2)
    ctx.filter = 'none'
  }

  private drawPicture(W: number, H: number, tone: string): void {
    const { ctx } = this
    ctx.fillStyle = tone
    ctx.fillRect(0, 0, W, H)
    const img = this.background
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, ...coverCrop(img.naturalWidth, img.naturalHeight, W, H), 0, 0, W, H)
    }
  }

  /** Runs segmentation once per new camera frame. Returns whether a mask is ready. */
  private updateMask(video: HTMLVideoElement): boolean {
    if (!this.segmenter) return false
    if (video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = video.currentTime
      // MediaPipe needs strictly increasing timestamps.
      const now = Math.max(performance.now(), this.lastTimestamp + 1)
      this.lastTimestamp = now
      this.segmenter.segmentForVideo(video, now, (result) => {
        const mask = result.confidenceMasks?.[0]
        if (!mask) return
        const values = mask.getAsFloat32Array()
        if (this.mask.width !== mask.width || this.mask.height !== mask.height || !this.maskData) {
          this.mask.width = mask.width
          this.mask.height = mask.height
          this.maskData = this.maskCtx.createImageData(mask.width, mask.height)
        }
        const data = this.maskData.data
        for (let i = 0; i < values.length; i++) {
          data[i * 4 + 3] = maskAlpha(values[i])
        }
        this.maskCtx.putImageData(this.maskData, 0, 0)
        this.hasMask = true
      })
    }
    return this.hasMask
  }

  /** The seller cut out with the latest mask, drawn onto the main canvas. */
  private drawPerson(video: HTMLVideoElement, { src, dst }: CameraPlacement, W: number, H: number, brightness: string): void {
    const p = this.personCtx
    p.globalCompositeOperation = 'source-over'
    p.clearRect(0, 0, W, H)
    p.filter = brightness
    p.drawImage(video, ...src, ...dst)
    p.filter = 'none'
    p.globalCompositeOperation = 'destination-in'
    const sx = this.mask.width / video.videoWidth
    const sy = this.mask.height / video.videoHeight
    p.drawImage(this.mask, src[0] * sx, src[1] * sy, src[2] * sx, src[3] * sy, ...dst)
    p.globalCompositeOperation = 'source-over'
    this.ctx.drawImage(this.person, 0, 0)
  }
}
