package expo.modules.livestreamer

import android.graphics.Bitmap
import android.util.Log
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.Segmentation
import com.google.mlkit.vision.segmentation.Segmenter
import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenterOptions
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Finds the person in the camera picture for the Blur and Picture backgrounds, with ML Kit's
 * selfie segmentation (the model ships inside the app: nothing to download). Works like the
 * website's MediaPipe segmenter: one small frame at a time, the newest mask kept; frames that
 * arrive while it's busy are skipped, so it never slows the live down. Each mask says which
 * frame it was found in, so the stage can draw it over that same frame (StageFilterRender).
 */
class PersonSegmenter(private val onUnavailable: (reason: String) -> Unit) {

  /** How sure the model is that each pixel is the person, 0–255, rows top first, in frame `frameId`. */
  class Mask(val bytes: ByteArray, val width: Int, val height: Int, val frameId: Long)

  private val executor = Executors.newSingleThreadExecutor()
  private val busy = AtomicBoolean(false)
  private var failures = 0
  private var reportedUnavailable = false

  @Volatile private var closed = false

  @Volatile var latest: Mask? = null
    private set

  /** Why ML Kit couldn't be set up, if it couldn't (reported with the first frame). */
  private var setupError: Throwable? = null

  private val client: Segmenter? =
    try {
      Segmentation.getClient(
        SelfieSegmenterOptions.Builder()
          // Stream mode smooths the mask from frame to frame, like a video.
          .setDetectorMode(SelfieSegmenterOptions.STREAM_MODE)
          // The model's own 256×256 output: the shader stretches it, so no resizing here.
          .enableRawSizeMask()
          .build(),
      )
    } catch (error: Throwable) {
      Log.w(TAG, "selfie segmentation unavailable", error)
      setupError = error
      null
    }

  val available: Boolean get() = client != null && !reportedUnavailable

  /**
   * True when a new frame would be looked at right away. Without ML Kit it stays true until
   * the first offer reports the problem once, then false.
   */
  val idle: Boolean get() = !closed && !busy.get() && !reportedUnavailable

  /**
   * Looks for the person in `frame` (upright); its mask comes back tagged with `frameId`.
   * The bitmap is read later: don't touch it until idle again.
   */
  fun offer(frame: Bitmap, frameId: Long) {
    val segmenter = client
    if (segmenter == null) {
      reportUnavailable(setupError)
      return
    }
    if (closed || !busy.compareAndSet(false, true)) return
    try {
      segmenter.process(InputImage.fromBitmap(frame, 0))
        .addOnSuccessListener(executor) { mask ->
          try {
            val buffer = mask.buffer
            buffer.rewind()
            val floats = buffer.asFloatBuffer()
            val count = mask.width * mask.height
            val bytes = ByteArray(count)
            for (i in 0 until minOf(count, floats.remaining())) {
              bytes[i] = (floats.get(i).coerceIn(0f, 1f) * 255f + 0.5f).toInt().toByte()
            }
            latest = Mask(bytes, mask.width, mask.height, frameId)
            failures = 0
          } finally {
            busy.set(false)
          }
        }
        .addOnFailureListener(executor) { error ->
          Log.w(TAG, "segmentation failed", error)
          if (++failures >= MAX_FAILURES) reportUnavailable(error)
          busy.set(false)
        }
    } catch (error: Throwable) {
      Log.w(TAG, "segmentation could not start", error)
      busy.set(false)
      if (++failures >= MAX_FAILURES) reportUnavailable(error)
    }
  }

  private fun reportUnavailable(error: Throwable?) {
    if (reportedUnavailable) return
    reportedUnavailable = true
    onUnavailable(describe(error))
  }

  /**
   * What went wrong in one line, shown under the warning so a seller's screenshot says why
   * (the phone's log is out of reach for them). The deepest cause is usually the telling one.
   */
  private fun describe(error: Throwable?): String {
    if (error == null) return "ML Kit isn't available"
    val root = generateSequence(error) { it.cause }.last()
    val name = { e: Throwable -> "${e.javaClass.simpleName}: ${e.message.orEmpty()}".trim() }
    return (if (root === error) name(error) else "${name(error)} ← ${name(root)}").take(MAX_REASON)
  }

  fun close() {
    closed = true
    latest = null
    runCatching { client?.close() }
    executor.shutdown()
  }

  companion object {
    private const val TAG = "LiveStreamer"
    private const val MAX_FAILURES = 5
    private const val MAX_REASON = 300
  }
}
