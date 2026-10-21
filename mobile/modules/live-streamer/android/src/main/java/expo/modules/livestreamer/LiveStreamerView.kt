package expo.modules.livestreamer

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Typeface
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
 * OpenGL pipeline feeds the screen and the encoder, with the popups drawn in as a filter.
 * The app's own buttons are React Native views on top and never reach the stream.
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
  private val images = RemoteImages { main.post { renderOverlay() } }
  private val renderer = OverlayRenderer(loadTypeface(context))
  private val overlayFilter = ImageFilterRender()

  private val stream: RtmpStream = RtmpStream(context, this, Camera2Source(context), MicrophoneSource())

  // Wanted settings (props) and what the pipeline was last prepared with.
  private var landscape = false
  private var resolution = Resolution.P720
  private var front = true
  private var prepared: Pair<Boolean, Resolution>? = null

  private var surfaceReady = false
  private var filterAdded = false
  private var overlayJson = "[]"
  private var lastUrl: String? = null
  private var stopRequested = false
  private var attempt = 0
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
        startPreviewIfReady()
      }

      override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
        stream.getGlInterface().setPreviewResolution(width, height)
      }

      override fun surfaceDestroyed(holder: SurfaceHolder) {
        surfaceReady = false
        // Leaving the app stops the preview; a running stream keeps its encoder (see README).
        if (stream.isOnPreview) stream.stopPreview()
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
    if (stream.isOnPreview) stream.stopPreview()
    prepare()
    startPreviewIfReady()
  }

  private fun prepare(): Boolean {
    val ok = try {
      // Portrait: the camera frame is rotated 90°, so the stream comes out short × long.
      stream.prepareVideo(resolution.long, resolution.short, resolution.videoBitrate, FPS, rotation = if (landscape) 0 else 90) &&
        stream.prepareAudio(SAMPLE_RATE, STEREO, AUDIO_BITRATE)
    } catch (error: IllegalArgumentException) {
      Log.w(TAG, "prepare failed", error)
      false
    }
    if (ok) {
      prepared = landscape to resolution
      mixer.channels = if (STEREO) 2 else 1
    } else {
      emitError("prepare", "This phone's camera or microphone can't record at ${resolution.short}p. Try 720p.")
    }
    return ok
  }

  private fun startPreviewIfReady() {
    if (released || !surfaceReady || stream.isOnPreview) return
    if (prepared == null && !prepare()) return
    try {
      stream.startPreview(surfaceView)
    } catch (error: Exception) {
      Log.w(TAG, "preview failed", error)
      emitError("camera", "The camera couldn't start. Close other camera apps and try again.")
      return
    }
    if (!filterAdded) {
      overlayFilter.setScale(100f, 100f)
      overlayFilter.setPosition(0f, 0f)
      stream.getGlInterface().addFilter(overlayFilter)
      filterAdded = true
    }
    applyFacing()
    renderOverlay()
    emitStatus(if (stream.isStreaming) "live" else "previewing")
  }

  private fun applyFacing() {
    val camera = stream.videoSource as? Camera2Source ?: return
    if (!stream.isOnPreview && !stream.isStreaming) return
    val isFront = camera.getCameraFacing() == CameraHelper.Facing.FRONT
    if (isFront != front) camera.switchCamera()
  }

  // ---- streaming -----------------------------------------------------------------------

  fun startStream(url: String) {
    if (released) return
    if (stream.isStreaming) return
    if (prepared == null && !prepare()) return
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
    if (stream.isStreaming) stream.stopStream()
    emitStatus("stopped")
  }

  /** "Try now": drop the pending retry and connect again straight away. */
  fun restartStream() {
    val url = lastUrl ?: return
    if (stream.isStreaming) {
      stopRequested = true
      stream.stopStream()
    }
    startStream(url)
  }

  fun switchCamera() {
    front = !front
    (stream.videoSource as? Camera2Source)?.switchCamera()
  }

  fun setMicMuted(muted: Boolean) {
    // Muted in the mixer, not the microphone: sound effects still reach the live.
    mixer.micMuted = muted
  }

  // ---- popups and sounds ------------------------------------------------------------

  fun setOverlay(json: String) {
    overlayJson = json
    renderOverlay()
  }

  private fun renderOverlay() {
    if (released || !filterAdded) return
    val size = stream.getGlInterface().getEncoderSize()
    if (size.x <= 0 || size.y <= 0) return
    val specs = OverlaySpec.parseList(overlayJson)
    val bitmap: Bitmap = renderer.render(specs, size.x, size.y) { url -> images.get(url) }
    overlayFilter.setImage(bitmap)
  }

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
        stream.stopStream()
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
      stream.stopStream()
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
    try {
      if (stream.isStreaming) stream.stopStream()
      if (stream.isOnPreview) stream.stopPreview()
      stream.release()
    } catch (error: Exception) {
      Log.w(TAG, "release failed", error)
    }
    sounds.release()
    images.release()
    main.removeCallbacksAndMessages(null)
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

    private fun loadTypeface(context: Context): Typeface =
      try {
        Typeface.createFromAsset(context.assets, "livestreamer/BricolageGrotesque-ExtraBold.ttf")
      } catch (_: RuntimeException) {
        Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
      }
  }
}
