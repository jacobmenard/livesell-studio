package expo.modules.livestreamer

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Log
import android.util.LruCache
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * Pictures for image popups (the seller's uploads on the NegosyoWork server). Downloaded
 * once in the background and kept small; `onLoaded` redraws the overlay when one arrives.
 */
class RemoteImages(private val onLoaded: () -> Unit) {

  private val executor = Executors.newSingleThreadExecutor()
  private val pending = ConcurrentHashMap.newKeySet<String>()
  private val failed = ConcurrentHashMap.newKeySet<String>()
  private val cache = object : LruCache<String, Bitmap>(MAX_BYTES) {
    override fun sizeOf(key: String, value: Bitmap) = value.byteCount
  }

  @Volatile private var released = false

  fun get(url: String): Bitmap? {
    cache.get(url)?.let { return it }
    if (!failed.contains(url) && pending.add(url)) executor.execute { download(url) }
    return null
  }

  private fun download(url: String) {
    try {
      val connection = URL(url).openConnection() as HttpURLConnection
      connection.connectTimeout = 10_000
      connection.readTimeout = 15_000
      connection.instanceFollowRedirects = true
      try {
        if (connection.responseCode !in 200..299) throw IOException("HTTP ${connection.responseCode}")
        if (connection.contentLengthLong > MAX_DOWNLOAD) throw IOException("too large")
        val bytes = connection.inputStream.use { it.readBytes() }
        if (bytes.size > MAX_DOWNLOAD) throw IOException("too large")
        val bitmap = decodeScaled(bytes) ?: throw IOException("not an image")
        if (!released) {
          cache.put(url, bitmap)
          onLoaded()
        }
      } finally {
        connection.disconnect()
      }
    } catch (error: Exception) {
      Log.w("LiveStreamer", "image popup failed to load", error)
      failed.add(url)
    } finally {
      pending.remove(url)
    }
  }

  /** Uploads are capped at 5 MB; anything bigger than 1080 px on its long side is scaled down. */
  private fun decodeScaled(bytes: ByteArray): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_SIDE) sample *= 2
    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
  }

  fun release() {
    released = true
    executor.shutdownNow()
    cache.evictAll()
  }

  companion object {
    private const val MAX_BYTES = 24 * 1024 * 1024
    private const val MAX_DOWNLOAD = 6L * 1024 * 1024
    private const val MAX_SIDE = 1080
  }
}
