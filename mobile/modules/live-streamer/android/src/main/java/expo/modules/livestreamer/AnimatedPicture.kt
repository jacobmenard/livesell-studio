package expo.modules.livestreamer

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ImageDecoder
import android.graphics.drawable.AnimatedImageDrawable
import android.os.Build
import androidx.annotation.RequiresApi
import java.nio.ByteBuffer
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * A moving picture (GIF or animated WebP) for the live. Android decodes its frames on its own
 * thread; frame() draws the current one into one of two reused bitmaps (the GPU may still be
 * uploading the other), so animating never allocates a new picture per frame.
 *
 * Only on Android 9+ (AnimatedImageDrawable); older phones show the first frame, as before.
 */
@RequiresApi(Build.VERSION_CODES.P)
class AnimatedPicture private constructor(private val drawable: AnimatedImageDrawable, val width: Int, val height: Int) {

  private val buffers = Array(2) { Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888) }
  private var next = 0
  private var started = false
  private var lastTick = -1L
  private var lastFrame: Bitmap? = null

  /**
   * The frame to show on `tick`. Asked again within the same tick (the same GIF as background
   * and foreground, or in two popups) it returns that same frame instead of swapping buffers.
   * Main thread only: AnimatedImageDrawable advances on the thread that started it.
   */
  fun frame(tick: Long): Bitmap {
    lastFrame?.let { if (tick == lastTick) return it }
    if (!started) {
      drawable.start()
      started = true
    }
    val bitmap = buffers[next]
    next = 1 - next
    bitmap.eraseColor(Color.TRANSPARENT)
    drawable.setBounds(0, 0, width, height)
    drawable.draw(Canvas(bitmap))
    lastTick = tick
    lastFrame = bitmap
    return bitmap
  }

  fun stop() {
    if (started) drawable.stop()
    started = false
  }

  companion object {
    /**
     * Decodes `bytes` as a moving picture, scaled to fit within `maxSide`, or null when it's a
     * still picture (or can't be decoded this way: the still decoder still handles it).
     */
    fun decode(bytes: ByteArray, maxSide: Int): AnimatedPicture? {
      if (!looksAnimatable(bytes)) return null
      return try {
        val source = ImageDecoder.createSource(ByteBuffer.wrap(bytes))
        val drawable = ImageDecoder.decodeDrawable(source) { decoder, info, _ ->
          val longest = max(info.size.width, info.size.height)
          if (longest > maxSide) {
            val scale = maxSide.toFloat() / longest
            decoder.setTargetSize((info.size.width * scale).roundToInt().coerceAtLeast(1), (info.size.height * scale).roundToInt().coerceAtLeast(1))
          }
          // Drawn into our own software bitmaps, not a hardware canvas.
          decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        } as? AnimatedImageDrawable ?: return null
        // Keep moving for the whole live, as the web stage's <img> loop does for live GIFs.
        drawable.repeatCount = AnimatedImageDrawable.REPEAT_INFINITE
        val w = drawable.intrinsicWidth
        val h = drawable.intrinsicHeight
        if (w <= 0 || h <= 0) null else AnimatedPicture(drawable, w, h)
      } catch (_: Exception) {
        null
      }
    }

    /** GIF ("GIF8…") or WebP ("RIFF….WEBP"); only these can move. */
    private fun looksAnimatable(b: ByteArray): Boolean {
      if (b.size < 12) return false
      val gif = b[0] == 'G'.code.toByte() && b[1] == 'I'.code.toByte() && b[2] == 'F'.code.toByte() && b[3] == '8'.code.toByte()
      val webp = b[0] == 'R'.code.toByte() && b[1] == 'I'.code.toByte() && b[2] == 'F'.code.toByte() && b[3] == 'F'.code.toByte() &&
        b[8] == 'W'.code.toByte() && b[9] == 'E'.code.toByte() && b[10] == 'B'.code.toByte() && b[11] == 'P'.code.toByte()
      return gif || webp
    }
  }
}
