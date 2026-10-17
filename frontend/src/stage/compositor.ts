import type { FaceLandmarker, ImageSegmenter, NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { BackgroundMode } from '../lib/types'
import { ChromaKeyer } from './chroma'
import { Enhancer, isNeutralLook, lookAsCssFilter, sameLook, type CameraLook } from './enhance'
import { drawFaceEffect, poseFromPoints, smoothPose, type FaceEffectId, type FacePose } from './faceEffects'
import { loadFaceTracker } from './faceTracker'
import { filterAsCssFilter, filterGrade, type CameraFilterId } from './filters'
import { coverCrop, maskAlpha, placeCamera, type CameraPlacement } from './geometry'
import { loadSegmenter } from './segmenter'

/** Camera frames without a face before an effect disappears (brief misses don't flicker it). */
const FACE_GRACE_FRAMES = 6

/** A camera frame ready to draw: the video itself, the green-screen key, or the enhanced frame. */
type Frame = HTMLVideoElement | HTMLCanvasElement

export interface CompositorSettings {
  width: number
  height: number
  mode: BackgroundMode
  mirror: boolean
  /** Brightness, contrast, saturation, warmth and face smoothing (see enhance.ts). */
  look: CameraLook
  /** A face-tracked effect drawn over the camera (see faceEffects.ts). */
  faceEffect: FaceEffectId
  /** A colour filter for the whole picture (see filters.ts), and its strength (0–100). */
  filter: CameraFilterId
  filterStrength: number
  /** −100–100: 0 fills the stage, above zooms in, below zooms out (see placeCamera). */
  zoom: number
  keyColor: [number, number, number]
  similarity: number
  smoothness: number
}

/** What the seller should know about background removal and face effects (never shown to viewers). */
export type CompositorStatus =
  | 'ok'
  | 'loading-segmentation'
  | 'segmentation-unavailable'
  | 'chroma-unavailable'
  | 'loading-face-tracking'
  | 'face-tracking-unavailable'

/**
 * Draws the camera with its background treatment into a canvas, every frame:
 * None (as is), Blur (soft room), Picture (person cut out) or Green screen (keyed).
 * For Picture and Green screen the canvas stays see-through around the seller, and the
 * picture shows from behind it (VideoLayer), so animated GIF backgrounds play. If background
 * removal can't run, it falls back to the plain camera rather than hiding the seller.
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
  private settings: CompositorSettings | null = null
  private segmenter: ImageSegmenter | null = null
  private segmenterState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle'
  private chroma: ChromaKeyer | null = null
  private chromaFailed = false
  private enhancer: Enhancer | null = null
  private enhancerFailed = false
  private enhancedTime = -1
  private enhancedLook: CameraLook | null = null
  private enhancedFilter = ''
  private faceTracker: FaceLandmarker | null = null
  private faceState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle'
  private faceVideoTime = -1
  private faceTimestamp = 0
  private pose: FacePose | null = null
  private framesWithoutFace = 0
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
    this.faceVideoTime = -1
    this.pose = null
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
    if (settings.faceEffect !== 'none' && this.faceState === 'idle') {
      this.loadFaceTracking()
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

  private loadFaceTracking(): void {
    this.faceState = 'loading'
    this.refreshStatus()
    loadFaceTracker()
      .then((tracker) => {
        if (this.disposed) return
        this.faceTracker = tracker
        this.faceState = 'ready'
        this.refreshStatus()
      })
      .catch((error) => {
        console.warn('[stage] face effects unavailable', error)
        this.faceState = 'failed'
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
    // Background news comes first; face effects only when there is none.
    if (next === 'ok' && this.settings && this.settings.faceEffect !== 'none') {
      if (this.faceState === 'loading') next = 'loading-face-tracking'
      if (this.faceState === 'failed') next = 'face-tracking-unavailable'
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

    // 1. What is behind the seller. A Picture / Green screen picture shows from behind the
    //    canvas (VideoLayer); with no camera yet, None and Blur show a plain dark stage.
    if (!live && (s.mode === 'none' || s.mode === 'blur')) {
      ctx.fillStyle = '#2A2730'
      ctx.fillRect(0, 0, W, H)
    }
    if (!live || !video) return

    const place = placeCamera(video.videoWidth, video.videoHeight, W, H, s.zoom)
    // Green screen keys first (so the look can't shift the key colour), then the look is
    // applied once; everything below draws that frame. Segmentation still reads the video.
    const keyed = s.mode === 'green' ? (this.chroma?.render(video, s.keyColor, s.similarity, s.smoothness) ?? null) : null
    const { frame, filter } = this.withLook(keyed ?? video, video, s)

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

    // 3. The face effect on top (drawn unmirrored, so emoji and text don't come out backwards).
    if (s.faceEffect !== 'none') {
      const pose = this.trackFace(video, place, W, s.mirror)
      if (pose) drawFaceEffect(ctx, s.faceEffect, pose, performance.now() / 1000)
    }
  }

  /**
   * Finds the face once per new camera frame and maps it onto the stage exactly where the
   * camera is drawn (same crop, zoom and mirroring). Keeps the last pose for a few frames
   * so a brief miss doesn't make the effect flicker.
   */
  private trackFace(video: HTMLVideoElement, { src, dst }: CameraPlacement, W: number, mirror: boolean): FacePose | null {
    if (!this.faceTracker) return null
    if (video.currentTime === this.faceVideoTime) return this.pose
    this.faceVideoTime = video.currentTime
    // MediaPipe needs strictly increasing timestamps (per task).
    const now = Math.max(performance.now(), this.faceTimestamp + 1)
    this.faceTimestamp = now

    let landmarks: NormalizedLandmark[] | undefined
    try {
      landmarks = this.faceTracker.detectForVideo(video, now).faceLandmarks[0]
    } catch (error) {
      console.warn('[stage] face tracking stopped', error)
      this.faceTracker = null
      this.faceState = 'failed'
      this.refreshStatus()
      return null
    }

    const [sx, sy, sw, sh] = src
    const [dx, dy, dw, dh] = dst
    const toStage = (l: NormalizedLandmark) => {
      const x = dx + ((l.x * video.videoWidth - sx) * dw) / sw
      return { x: mirror ? W - x : x, y: dy + ((l.y * video.videoHeight - sy) * dh) / sh }
    }
    const found = landmarks ? poseFromPoints((i) => (landmarks[i] ? toStage(landmarks[i]) : undefined)) : null

    if (found) {
      this.pose = smoothPose(this.pose, found)
      this.framesWithoutFace = 0
    } else if (++this.framesWithoutFace > FACE_GRACE_FRAMES) {
      this.pose = null
    }
    return this.pose
  }

  /**
   * The frame with the seller's look and colour filter applied on the GPU, re-rendered only
   * for a new camera frame or new settings (the stage redraws at 60 fps, cameras send 30).
   * Without WebGL the basic adjustments come back as a canvas filter instead.
   */
  private withLook(source: Frame, video: HTMLVideoElement, s: CompositorSettings): { frame: Frame; filter: string } {
    const { look } = s
    const filtered = s.filter !== 'none' && s.filterStrength > 0
    if (isNeutralLook(look) && !filtered) return { frame: source, filter: 'none' }
    if (!this.enhancer && !this.enhancerFailed) {
      try {
        this.enhancer = new Enhancer()
      } catch (error) {
        console.warn('[stage] camera look falls back to basic filters', error)
        this.enhancerFailed = true
      }
    }
    if (!this.enhancer) {
      const css = [isNeutralLook(look) ? '' : lookAsCssFilter(look), filtered ? filterAsCssFilter(s.filter, s.filterStrength) : ''].filter(Boolean).join(' ')
      return { frame: source, filter: css || 'none' }
    }

    const filterKey = filtered ? `${s.filter}:${s.filterStrength}` : ''
    const fresh =
      source === video &&
      video.currentTime === this.enhancedTime &&
      this.enhancedLook !== null &&
      sameLook(look, this.enhancedLook) &&
      filterKey === this.enhancedFilter
    if (!fresh) {
      this.enhancer.render(source, video.videoWidth, video.videoHeight, look, filtered ? { strength: s.filterStrength / 100, grade: filterGrade(s.filter) } : null)
      this.enhancedTime = video.currentTime
      this.enhancedLook = look
      this.enhancedFilter = filterKey
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
