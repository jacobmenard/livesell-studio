package expo.modules.livestreamer

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Typeface
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.view.ViewGroup
import com.pedro.common.ConnectChecker
import com.pedro.common.StreamingStatsReport
import com.pedro.encoder.input.gl.render.filters.`object`.ImageFilterRender
import com.pedro.encoder.input.sources.audio.MicrophoneSource
import com.pedro.encoder.input.sources.video.Camera2Source
import com.pedro.encoder.input.video.CameraHelper
import com.pedro.library.rtmp.RtmpStream
import com.pedro.library.util.QueueAwareBitrateAdapter
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

enum class Resolution(val long: Int, val short: Int, val videoBitrate: Int) {
  P720(1280, 720, 2_500_000),
  P1080(1920, 1080, 4_500_000),
}

/**
 * The camera preview the seller sees, which is also exactly what viewers get: the same
 * OpenGL pipeline feeds the screen and the encoder. Two filters run on the camera, in order:
 *  1. StageFilterRender: zoom, mirror, look, colour filter and background;
 *  2. the overlay: the foreground banner and the popups, drawn as one picture.
 * The app's own buttons are React Native views on top and never reach the stream.
 *
 * Used for previews too (the setup editor): the microphone is only opened when a live starts.
 */
@SuppressLint("ViewConstructor")
class LiveStreamerView(context: Context, appContext: AppContext) : ExpoView(context, appContext), ConnectChecker {

  // The SurfaceView child is sized by Android's layout pass, inside the box Yoga gives this view.
  override val shouldUseAndroidLayout = true

  private val onStatus by EventDispatcher()
  private val onStats by EventDispatcher()
  private val onError by EventDispatcher()

  private val main = Handler(Looper.getMainLooper())
  private val surfaceView = SurfaceView(context)
  private val mixer = SoundMixer()
  private val sounds = SoundBank(context.assets)
  private val popupImages = RemoteImages(context.assets, 1080) {
    main.post {
      renderOverlay()
      ensureAnimating()
    }
  }
  private val pictures = RemoteImages(context.assets, 1920) {
    main.post {
      applyPicture()
      renderOverlay()
      ensureAnimating()
    }
  }
  private val renderer = OverlayRenderer(loadTypeface(context))
  private val overlayFilter = ImageFilterRender()
  private val segmenter = PersonSegmenter {
    main.post { emitError("segmentation", "Background removal isn't working on this phone right now, so viewers see your real room.") }
  }
  private val stageFilter = StageFilterRender(context.assets, segmenter)

  private val stream: RtmpStream = RtmpStream(context, this, Camera2Source(context), MicrophoneSource())

  // Wanted settings (props) and what the pipeline was last prepared with.
  private var landscape = false
  private var resolution = Resolution.P720
  private var front = true
  private var prepared: Pair<Boolean, Resolution>? = null
  private var audioPrepared = false

  private var surfaceReady = false
  /** Our two filters are in RootEncoder's chain (it drops them whenever its GL pipeline stops). */
  private var filtersAttached = false
  private var overlaySpecs: List<OverlaySpec> = emptyList()
  private var look = LookSpec()
  private var shownPicture: String? = null
  private var lastUrl: String? = null
  private var stopRequested = false
  private var attempt = 0
  private var previewAttempts = 0
  private var lastStatsAt = 0L
  private var released = false

  private val bitrateAdapter = QueueAwareBitrateAdapter(Resolution.P1080.videoBitrate + AUDIO_BITRATE) { bitrate ->
    stream.setVideoBitrateOnFly((bitrate - AUDIO_BITRATE).coerceAtLeast(MIN_VIDEO_BITRATE))
  }

  init {
    stream.getGlInterface().autoHandleOrientation = false
    (stream.audioSource as? MicrophoneSource)?.setAudioEffect(mixer)
    stream.getStreamClient().setReTries(MAX_RETRIES)

    addView(surfaceView, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    surfaceView.holder.addCallback(object : SurfaceHolder.Callback {
      override fun surfaceCreated(holder: SurfaceHolder) {
        surfaceReady = true
        previewAttempts = 0
        startPreviewIfReady()
      }

      override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
        stream.getGlInterface().setPreviewResolution(width, height)
      }

      override fun surfaceDestroyed(holder: SurfaceHolder) {
        surfaceReady = false
        // Leaving the app stops the preview; a running stream keeps its encoder (see README).
        stopPreview()
      }
    })
  }

  // ---- props -------------------------------------------------------------------------

  fun setOrientation(isLandscape: Boolean) {
    landscape = isLandscape
  }

  fun setResolution(value: Resolution) {
    resolution = value
  }

  fun setFacing(front: Boolean) {
    this.front = front
    applyFacing()
  }

  /** After a batch of prop changes: (re)prepare if the shape or quality changed. */
  fun applyConfig() {
    if (released) return
    val wanted = landscape to resolution
    if (prepared == wanted) return
    if (stream.isStreaming) {
      // The shape of a running live can't change; it applies to the next one.
      return
    }
    stopPreview()
    prepareVideo()
    startPreviewIfReady()
  }

  private fun prepareVideo(): Boolean {
    val ok = try {
      // Portrait: the camera frame is rotated 90°, so the stream comes out short × long.
      stream.prepareVideo(resolution.long, resolution.short, resolution.videoBitrate, FPS, rotation = if (landscape) 0 else 90)
    } catch (error: IllegalArgumentException) {
      Log.w(TAG, "prepare video failed", error)
      false
    }
    if (ok) {
      prepared = landscape to resolution
    } else {
      emitError("prepare", "This phone's camera can't record at ${resolution.short}p. Try 720p.")
    }
    return ok
  }

  /** The microphone, only when a live starts (a preview needs no microphone permission). */
  private fun prepareAudio(): Boolean {
    if (audioPrepared) return true
    audioPrepared = try {
      stream.prepareAudio(SAMPLE_RATE, STEREO, AUDIO_BITRATE)
    } catch (error: RuntimeException) {
      Log.w(TAG, "prepare audio failed", error)
      false
    }
    if (audioPrepared) {
      mixer.channels = if (STEREO) 2 else 1
    } else {
      emitError("microphone", "The microphone couldn't start. Allow it for NegosyoWork Studio, and close other apps that record sound.")
    }
    return audioPrepared
  }

  private fun startPreviewIfReady() {
    if (released || !surfaceReady || stream.isOnPreview) return
    if (prepared == null && !prepareVideo()) return
    // A fresh GL pipeline starts with no filters: ours go back in after the preview starts.
    val freshPipeline = !stream.getGlInterface().isRunning()
    try {
      stream.startPreview(surfaceView)
    } catch (error: Exception) {
      Log.w(TAG, "preview failed", error)
      // The screen we came from may still be letting go of the camera: try again shortly.
      if (++previewAttempts <= MAX_PREVIEW_ATTEMPTS) {
        main.postDelayed({ startPreviewIfReady() }, PREVIEW_RETRY_MS)
      } else {
        emitError("camera", "The camera couldn't start. Close other camera apps and try again.")
      }
      return
    }
    previewAttempts = 0
    if (freshPipeline || !filtersAttached) attachFilters()
    applyFacing()
    applyLensZoomSoon()
    applyPicture()
    renderOverlay()
    ensureAnimating()
    emitStatus(if (stream.isStreaming) "live" else "previewing")
  }

  private fun attachFilters() {
    val gl = stream.getGlInterface()
    gl.addFilter(stageFilter)
    overlayFilter.setScale(100f, 100f)
    overlayFilter.setPosition(0f, 0f)
    gl.addFilter(overlayFilter)
    filtersAttached = true
  }

  private fun stopPreview() {
    if (!stream.isOnPreview) return
    stream.stopPreview()
    // Not live: RootEncoder stopped its GL pipeline and released every filter.
    if (!stream.isStreaming) filtersAttached = false
  }

  private fun applyFacing() {
    val camera = stream.videoSource as? Camera2Source ?: return
    if (!stream.isOnPreview && !stream.isStreaming) return
    val isFront = camera.getCameraFacing() == CameraHelper.Facing.FRONT
    if (isFront != front) {
      camera.switchCamera()
      applyLensZoomSoon()
    }
  }

  /**
   * The camera's own zoom (0.5× = its wide lens). Android 11+ phones with several back lenses
   * switch to the wide one by themselves for zoom ratios below 1; others stop at their widest
   * (RootEncoder keeps the ratio inside what the camera allows), and the app is told so.
   */
  private fun applyLensZoom() {
    val camera = stream.videoSource as? Camera2Source ?: return
    if (!stream.isOnPreview && !stream.isStreaming) return
    try {
      camera.setZoom(look.lensZoom)
      val widest = camera.getZoomRange().lower
      if (look.lensZoom < 1f && widest > look.lensZoom + 0.01f && zoomLimitShown != widest) {
        zoomLimitShown = widest
        emitError("zoom", String.format(java.util.Locale.US, "This camera can only zoom out to %.1f×.", widest))
      }
    } catch (error: RuntimeException) {
      Log.w(TAG, "zoom failed", error)
    }
  }

  private var zoomLimitShown: Float? = null

  /** A camera that is (re)opening ignores zoom until its session runs: ask again shortly. */
  private fun applyLensZoomSoon() {
    applyLensZoom()
    main.postDelayed({ applyLensZoom() }, ZOOM_RETRY_MS)
    main.postDelayed({ applyLensZoom() }, ZOOM_RETRY_MS * 3)
  }

  // ---- the look ---------------------------------------------------------------------------

  /** Zoom, mirror, look, filter, background and foreground: src/stage/stageLook.ts NativeLook. */
  fun setLook(json: String) {
    val next = LookSpec.parse(json)
    val foregroundChanged = next.foreground != look.foreground
    val lensChanged = next.lensZoom != look.lensZoom
    look = next
    if (lensChanged) {
      zoomLimitShown = null
      applyLensZoom()
    }
    stageFilter.look = next
    applyPicture()
    if (foregroundChanged) renderOverlay()
    ensureAnimating()
  }

  /** The picture behind the person: shown once loaded (its tone until then). */
  private fun applyPicture() {
    val source = look.background.pictureSource
    if (source == null) {
      if (shownPicture != null) stageFilter.setPicture(null, null)
      shownPicture = null
      return
    }
    // A moving picture: its current frame, every tick of the frame ticker.
    val moving = movingFrame(pictures, source)
    if (moving != null) {
      stageFilter.setPicture(moving, source)
      shownPicture = source
      return
    }
    val bitmap = pictures.get(source)
    if (bitmap == null) {
      // Still loading: drop the old picture so a different one never flashes in its place.
      if (shownPicture != source) stageFilter.setPicture(null, source)
      return
    }
    if (shownPicture == source) return
    stageFilter.setPicture(bitmap, source)
    shownPicture = source
  }

  // ---- streaming -----------------------------------------------------------------------

  fun startStream(url: String) {
    if (released) return
    if (stream.isStreaming) return
    if (prepared == null && !prepareVideo()) return
    if (!prepareAudio()) return
    lastUrl = url
    stopRequested = false
    attempt = 0
    bitrateAdapter.reset()
    emitStatus("connecting")
    try {
      stream.startStream(url)
    } catch (error: Exception) {
      Log.w(TAG, "start failed", error)
      emitStatus("failed", reason = "The live couldn't start: ${error.message ?: "unknown error"}")
    }
  }

  fun stopStream() {
    stopRequested = true
    endStream()
    emitStatus("stopped")
  }

  private fun endStream() {
    if (!stream.isStreaming) return
    stream.stopStream()
    // Without a preview, stopping the live also stopped the GL pipeline and its filters.
    if (!stream.isOnPreview) filtersAttached = false
  }

  /** "Try now": drop the pending retry and connect again straight away. */
  fun restartStream() {
    val url = lastUrl ?: return
    if (stream.isStreaming) {
      stopRequested = true
      endStream()
    }
    startStream(url)
  }

  fun switchCamera() {
    front = !front
    (stream.videoSource as? Camera2Source)?.switchCamera()
    zoomLimitShown = null
    applyLensZoomSoon()
  }

  fun setMicMuted(muted: Boolean) {
    // Muted in the mixer, not the microphone: sound effects still reach the live.
    mixer.micMuted = muted
  }

  // ---- popups and sounds ------------------------------------------------------------

  fun setOverlay(json: String) {
    overlaySpecs = OverlaySpec.parseList(json)
    renderOverlay()
    ensureAnimating()
  }

  private fun renderOverlay() {
    if (released || !filtersAttached) return
    val size = stream.getGlInterface().getEncoderSize()
    if (size.x <= 0 || size.y <= 0) return
    val foreground = look.foreground
    val banner = foreground?.let { movingFrame(pictures, it.url) ?: pictures.get(it.url) }
    val bitmap: Bitmap = renderer.render(
      overlaySpecs,
      size.x,
      size.y,
      { url -> movingFrame(popupImages, url) ?: popupImages.get(url) },
      banner,
      foreground?.dockTop == true,
    )
    overlayFilter.setImage(bitmap)
  }

  // ---- moving pictures (GIF / animated WebP) and popup animations ---------------------------
  // Each loaded picture is one still frame; a moving one is redrawn on a ticker, only while
  // something on screen moves, and only the part that moves (the background, or the overlay).
  // Popup entrances and effects redraw the overlay too, at the stream's frame rate.

  private var tick = 0L
  private var animating = false
  /** A popup animated on the last tick: once none does, the overlay is drawn still one last time. */
  private var popupsWereAnimating = false

  private val frameTicker = object : Runnable {
    override fun run() {
      val background = backgroundMoves()
      val overlay = overlayMoves()
      val popupsMove = popupsAnimate()
      // An effect's last tick may have caught it mid-fade: draw its end state.
      if (popupsWereAnimating && !popupsMove && !overlay) renderOverlay()
      popupsWereAnimating = popupsMove
      if (released || !filtersAttached || (!background && !overlay)) {
        animating = false
        return
      }
      tick++
      if (background) applyPicture()
      if (overlay) renderOverlay()
      main.postDelayed(this, frameDelay())
    }
  }

  /** Starts the frame ticker if a moving picture is on screen; it stops itself once none is. */
  private fun ensureAnimating() {
    if (animating || released || !filtersAttached || (!backgroundMoves() && !overlayMoves())) return
    animating = true
    main.postDelayed(frameTicker, frameDelay())
  }

  /** Effects are smooth motion, so they redraw every stream frame; GIFs need far fewer. */
  private fun frameDelay(): Long = if (popupsAnimate()) EFFECT_FRAME_MS else FRAME_MS

  private fun popupsAnimate(): Boolean {
    val now = System.currentTimeMillis()
    return overlaySpecs.any { PopupMotion.moves(it, now) }
  }

  private fun backgroundMoves(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return false
    val source = look.background.pictureSource ?: return false
    return pictures.animation(source) != null
  }

  private fun overlayMoves(): Boolean {
    if (popupsAnimate()) return true
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return false
    if (look.foreground?.let { pictures.animation(it.url) } != null) return true
    return overlaySpecs.any { spec -> spec.kind == "image" && spec.imageUrl?.let { popupImages.animation(it) } != null }
  }

  private fun movingFrame(images: RemoteImages, source: String): Bitmap? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) images.animation(source)?.frame(tick) else null

  fun playSound(id: String, volume: Float, toStream: Boolean, monitor: Boolean) {
    val samples = sounds.load(id) ?: run {
      emitError("sound", "That sound isn't in this version of the app.")
      return
    }
    val gain = (volume / 100f).coerceIn(0f, 1f)
    if (gain <= 0f) return
    if (toStream && stream.isStreaming) mixer.play(samples, gain)
    // Not live yet (testing), or the seller wants to hear it: play it on the speaker too.
    if (monitor || !stream.isStreaming) sounds.playOnSpeaker(samples, gain)
  }

  // ---- ConnectChecker (called on the network thread) -------------------------------------

  override fun onConnectionStarted(url: String) {
    main.post { emitStatus(if (attempt > 0) "reconnecting" else "connecting") }
  }

  override fun onConnectionSuccess() {
    main.post {
      attempt = 0
      // RootEncoder only refills its retry budget when a stream is fully stopped; refill it on
      // every successful (re)connect so a long live with many short drops keeps retrying.
      stream.getStreamClient().setReTries(MAX_RETRIES)
      emitStatus("live")
    }
  }

  override fun onConnectionFailed(reason: String) {
    main.post {
      if (stopRequested) return@post
      if (stream.getStreamClient().reTry(RETRY_DELAY_MS, reason, null)) {
        attempt += 1
        emitStatus("reconnecting", reason = reason)
      } else {
        endStream()
        emitStatus("failed", reason = reason)
      }
    }
  }

  override fun onDisconnect() {
    main.post {
      if (stopRequested) emitStatus("stopped")
    }
  }

  override fun onAuthError() {
    main.post {
      stopRequested = true
      endStream()
      emitStatus("failed", reason = "auth")
    }
  }

  override fun onAuthSuccess() {}

  override fun onStreamingStats(report: StreamingStatsReport) {
    bitrateAdapter.onStreamingStats(report)
    val now = SystemClock.elapsedRealtime()
    if (now - lastStatsAt < 1000) return
    lastStatsAt = now
    main.post {
      onStats(
        mapOf(
          "bitrateKbps" to (report.smoothedBitrate / 1000L).toInt(),
          "queueKB" to (report.queueBytesOut / 1024L).toInt(),
          "congestion" to report.queueCongestionPercent.toDouble(),
          "throughput" to report.throughput.name.lowercase(),
        ),
      )
    }
  }

  // ---- events and cleanup ----------------------------------------------------------------

  private fun emitStatus(status: String, reason: String? = null) {
    // Event payloads can't hold nulls: "reason" is simply left out when there is none.
    onStatus(
      buildMap {
        put("status", status)
        if (reason != null) put("reason", reason)
        put("attempt", attempt)
        put("maxAttempts", MAX_RETRIES)
        put("retryDelayMs", RETRY_DELAY_MS.toInt())
      },
    )
  }

  private fun emitError(code: String, message: String) {
    onError(mapOf("code" to code, "message" to message))
  }

  fun release() {
    if (released) return
    released = true
    stopRequested = true
    main.removeCallbacksAndMessages(null)
    try {
      if (stream.isStreaming) stream.stopStream()
      if (stream.isOnPreview) stream.stopPreview()
      stream.release()
    } catch (error: Exception) {
      Log.w(TAG, "release failed", error)
    }
    filtersAttached = false
    segmenter.close()
    sounds.release()
    popupImages.release()
    pictures.release()
  }

  companion object {
    private const val TAG = "LiveStreamer"
    private const val FPS = 30
    const val SAMPLE_RATE = 44_100
    private const val STEREO = true
    private const val AUDIO_BITRATE = 128_000
    private const val MIN_VIDEO_BITRATE = 400_000
    /** 24 tries, 5 s apart: about 2 minutes before the live is given up. */
    private const val MAX_RETRIES = 24
    private const val RETRY_DELAY_MS = 5_000L
    private const val MAX_PREVIEW_ATTEMPTS = 4
    private const val PREVIEW_RETRY_MS = 600L
    /** Moving pictures redraw about 20 times a second (most GIFs run at 10–25 fps). */
    private const val FRAME_MS = 50L
    private const val ZOOM_RETRY_MS = 400L
    /** Popup entrances and effects: one redraw per stream frame (30 fps). */
    private const val EFFECT_FRAME_MS = 1000L / FPS

    private fun loadTypeface(context: Context): Typeface =
      try {
        Typeface.createFromAsset(context.assets, "livestreamer/BricolageGrotesque-ExtraBold.ttf")
      } catch (_: RuntimeException) {
        Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
      }
  }
}
