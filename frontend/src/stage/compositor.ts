import type { ImageSegmenter } from '@mediapipe/tasks-vision'
import type { BackgroundMode } from '../lib/types'
import { ChromaKeyer } from './chroma'
import { Enhancer, isNeutralLook, lookAsCssFilter, sameLook, type CameraLook } from './enhance'
import { coverCrop, maskAlpha, placeCamera, type CameraPlacement } from './geometry'
import { loadSegmenter } from './segmenter'

/** A camera frame ready to draw: the video itself, the green-screen key, or the enhanced frame. */
type Frame = HTMLVideoElement | HTMLCanvasElement

export interface CompositorSettings {
  width: number
  height: number
  mode: BackgroundMode
  mirror: boolean
  /** Brightness, contrast, saturation, warmth and face smoothing (see enhance.ts). */
  look: CameraLook
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
  private enhancer: Enhancer | null = null
  private enhancerFailed = false
  private enhancedTime = -1
  private enhancedLook: CameraLook | null = null
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
    this.enhancer?.dispose()
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
    // Green screen keys first (so the look can't shift the key colour), then the look is
    // applied once; everything below draws that frame. Segmentation still reads the video.
    const keyed = s.mode === 'green' ? (this.chroma?.render(video, s.keyColor, s.similarity, s.smoothness) ?? null) : null
    const { frame, filter } = this.withLook(keyed ?? video, video, s.look)

    ctx.save()
    if (s.mirror) {
      ctx.translate(W, 0)
      ctx.scale(-1, 1)
    }

    switch (s.mode) {
      case 'none':
        // Zoomed out past the stage edges: fill around the camera with a soft copy of it.
        if (place.dst[2] < W || place.dst[3] < H) this.drawBlurredRoom(frame, video, W, H, filter, 0)
        ctx.filter = filter
        ctx.drawImage(frame, ...place.src, ...place.dst)
        break
      case 'blur':
        this.drawBlurredRoom(frame, video, W, H, filter, s.zoom)
        if (this.updateMask(video)) this.drawPerson(frame, video, place, W, H, filter)
        break
      case 'image':
        if (this.updateMask(video)) {
          this.drawPerson(frame, video, place, W, H, filter)
        } else {
          // Removal still loading or unavailable: never hide the seller.
          ctx.filter = filter
          ctx.drawImage(frame, ...place.src, ...place.dst)
        }
        break
      case 'green':
        ctx.filter = filter
        ctx.drawImage(frame, ...place.src, ...place.dst)
        break
    }
    ctx.restore()
  }

  /**
   * The frame with the seller's look applied on the GPU, re-rendered only for a new camera
   * frame or new settings (the stage redraws at 60 fps, cameras send 30). Without WebGL the
   * basic adjustments come back as a canvas filter instead.
   */
  private withLook(source: Frame, video: HTMLVideoElement, look: CameraLook): { frame: Frame; filter: string } {
    if (isNeutralLook(look)) return { frame: source, filter: 'none' }
    if (!this.enhancer && !this.enhancerFailed) {
      try {
        this.enhancer = new Enhancer()
      } catch (error) {
        console.warn('[stage] camera look falls back to basic filters', error)
        this.enhancerFailed = true
      }
    }
    if (!this.enhancer) return { frame: source, filter: lookAsCssFilter(look) }

    const fresh = source === video && video.currentTime === this.enhancedTime && this.enhancedLook !== null && sameLook(look, this.enhancedLook)
    if (!fresh) {
      this.enhancer.render(source, video.videoWidth, video.videoHeight, look)
      this.enhancedTime = video.currentTime
      this.enhancedLook = look
    }
    return { frame: this.enhancer.canvas, filter: 'none' }
  }

  /** The camera softly blurred across the whole stage (Blur mode, and the fill around a zoomed-out camera). */
  private drawBlurredRoom(frame: Frame, video: HTMLVideoElement, W: number, H: number, filter: string, zoom: number): void {
    const { ctx } = this
    ctx.filter = `blur(${Math.max(4, Math.round(W / 90))}px)${filter === 'none' ? '' : ` ${filter}`}`
    // Overscan slightly so the blur doesn't show soft dark edges.
    const pad = W * 0.04
    ctx.drawImage(frame, ...coverCrop(video.videoWidth, video.videoHeight, W, H, zoom), -pad, -pad, W + pad * 2, H + pad * 2)
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
  private drawPerson(frame: Frame, video: HTMLVideoElement, { src, dst }: CameraPlacement, W: number, H: number, filter: string): void {
    const p = this.personCtx
    p.globalCompositeOperation = 'source-over'
    p.clearRect(0, 0, W, H)
    p.filter = filter
    p.drawImage(frame, ...src, ...dst)
    p.filter = 'none'
    p.globalCompositeOperation = 'destination-in'
    const sx = this.mask.width / video.videoWidth
    const sy = this.mask.height / video.videoHeight
    p.drawImage(this.mask, src[0] * sx, src[1] * sy, src[2] * sx, src[3] * sy, ...dst)
    p.globalCompositeOperation = 'source-over'
    this.ctx.drawImage(this.person, 0, 0)
  }
}
