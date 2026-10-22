package expo.modules.livestreamer

import android.content.res.AssetManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.SystemClock
import android.util.Log
import android.util.LruCache
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * Pictures for the live: image popups, background photos and foreground banners (the
 * seller's uploads on the NegosyoWork server), and the bundled backdrops ("asset:<path>").
 * Loaded once in the background and kept within `maxSide`; `onLoaded` redraws when one
 * arrives. A failed download is tried again after a while (the signal may come back).
 * Bitmaps are never recycled here: the GPU upload may still be reading one.
 *
 * A moving GIF or WebP also keeps its animation (animation(source)); get() still returns
 * its first frame, so anything that only draws stills works as before.
 */
class RemoteImages(private val assets: AssetManager, private val maxSide: Int, private val onLoaded: () -> Unit) {

  private val executor = Executors.newSingleThreadExecutor()
  private val pending = ConcurrentHashMap.newKeySet<String>()
  private val failedAt = ConcurrentHashMap<String, Long>()
  private val cache = object : LruCache<String, Bitmap>(MAX_BYTES) {
    override fun sizeOf(key: String, value: Bitmap) = value.byteCount
  }
  private val animations = ConcurrentHashMap<String, AnimatedPicture>()

  @Volatile private var released = false

  fun get(source: String): Bitmap? {
    cache.get(source)?.let { return it }
    val failed = failedAt[source]
    if (failed != null && SystemClock.elapsedRealtime() - failed < RETRY_AFTER_MS) return null
    if (pending.add(source)) executor.execute { load(source) }
    return null
  }

  /** The moving version of a loaded GIF / animated WebP, or null for a still (or not loaded yet). */
  fun animation(source: String): AnimatedPicture? = animations[source]

  private fun load(source: String) {
    try {
      val bytes = if (source.startsWith(ASSET)) {
        assets.open(source.removePrefix(ASSET)).use { it.readBytes() }
      } else {
        download(source)
      }
      val bitmap = decodeScaled(bytes) ?: throw IOException("not an image")
      val moving = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) AnimatedPicture.decode(bytes, minOf(maxSide, ANIMATED_MAX_SIDE)) else null
      if (!released) {
        if (moving != null) animations[source] = moving
        cache.put(source, bitmap)
        failedAt.remove(source)
        onLoaded()
      }
    } catch (error: Exception) {
      Log.w("LiveStreamer", "picture failed to load", error)
      failedAt[source] = SystemClock.elapsedRealtime()
    } finally {
      pending.remove(source)
    }
  }

  private fun download(url: String): ByteArray {
    val connection = URL(url).openConnection() as HttpURLConnection
    connection.connectTimeout = 10_000
    connection.readTimeout = 15_000
    connection.instanceFollowRedirects = true
    try {
      if (connection.responseCode !in 200..299) throw IOException("HTTP ${connection.responseCode}")
      if (connection.contentLengthLong > MAX_DOWNLOAD) throw IOException("too large")
      val bytes = connection.inputStream.use { it.readBytes() }
      if (bytes.size > MAX_DOWNLOAD) throw IOException("too large")
      return bytes
    } finally {
      connection.disconnect()
    }
  }

  /** Uploads are capped at 5 MB; anything bigger than `maxSide` on its long side is scaled down. */
  private fun decodeScaled(bytes: ByteArray): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxSide) sample *= 2
    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
  }

  fun release() {
    released = true
    executor.shutdownNow()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) animations.values.forEach { it.stop() }
    animations.clear()
    cache.evictAll()
  }

  companion object {
    const val ASSET = "asset:"
    private const val MAX_BYTES = 40 * 1024 * 1024
    private const val MAX_DOWNLOAD = 6L * 1024 * 1024
    private const val RETRY_AFTER_MS = 30_000L
    /** Moving pictures are uploaded every frame: smaller than stills to keep that light. */
    private const val ANIMATED_MAX_SIDE = 1080
  }
}
