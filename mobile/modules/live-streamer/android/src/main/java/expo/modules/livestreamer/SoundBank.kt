package expo.modules.livestreamer

import android.content.res.AssetManager
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.util.Log
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.ConcurrentHashMap

/**
 * The 13 built-in sound effects, bundled as WAV files in assets/livestreamer/sounds
 * (rendered by mobile/scripts/render-sounds.mjs from the web app's synthesis), decoded once
 * to mono 16-bit samples at the stream's sample rate.
 */
class SoundBank(private val assets: AssetManager) {

  private val cache = ConcurrentHashMap<String, ShortArray>()
  private val playing = mutableSetOf<AudioTrack>()

  fun load(id: String): ShortArray? {
    if (!ID.matches(id)) return null
    cache[id]?.let { return it }
    return try {
      val bytes = assets.open("livestreamer/sounds/$id.wav").use { it.readBytes() }
      Wav.decodeMono(bytes, LiveStreamerView.SAMPLE_RATE)?.also { cache[id] = it }
    } catch (error: IOException) {
      Log.w("LiveStreamer", "sound $id missing", error)
      null
    }
  }

  /** Plays on the phone's speaker (testing a pad, or the seller monitoring with earphones). */
  fun playOnSpeaker(samples: ShortArray, gain: Float) {
    if (samples.isEmpty()) return
    try {
      val track = AudioTrack.Builder()
        .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
        .setAudioFormat(
          AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(LiveStreamerView.SAMPLE_RATE)
            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
            .build(),
        )
        .setTransferMode(AudioTrack.MODE_STATIC)
        .setBufferSizeInBytes(samples.size * 2)
        .build()
      track.write(samples, 0, samples.size)
      track.setVolume(gain)
      track.setNotificationMarkerPosition(samples.size - 1)
      track.setPlaybackPositionUpdateListener(object : AudioTrack.OnPlaybackPositionUpdateListener {
        override fun onMarkerReached(t: AudioTrack) {
          synchronized(playing) { playing.remove(t) }
          t.release()
        }

        override fun onPeriodicNotification(t: AudioTrack) {}
      })
      synchronized(playing) { playing.add(track) }
      track.play()
    } catch (error: RuntimeException) {
      Log.w("LiveStreamer", "speaker playback failed", error)
    }
  }

  fun release() {
    synchronized(playing) {
      playing.forEach { runCatching { it.release() } }
      playing.clear()
    }
    cache.clear()
  }

  companion object {
    private val ID = Regex("^[a-z]{2,12}$")
  }
}

/** A small RIFF/WAVE reader: 16-bit PCM, mono or stereo, any sample rate. */
object Wav {
  fun decodeMono(bytes: ByteArray, targetRate: Int): ShortArray? {
    if (bytes.size < 44) return null
    val buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
    if (String(bytes, 0, 4, Charsets.US_ASCII) != "RIFF" || String(bytes, 8, 4, Charsets.US_ASCII) != "WAVE") return null

    var channels = 0
    var rate = 0
    var bits = 0
    var dataStart = -1
    var dataLength = 0
    var offset = 12
    while (offset + 8 <= bytes.size) {
      val id = String(bytes, offset, 4, Charsets.US_ASCII)
      val size = buf.getInt(offset + 4)
      val body = offset + 8
      if (size < 0 || body + size > bytes.size) break
      when (id) {
        "fmt " -> {
          if (buf.getShort(body).toInt() != 1) return null // PCM only
          channels = buf.getShort(body + 2).toInt()
          rate = buf.getInt(body + 4)
          bits = buf.getShort(body + 14).toInt()
        }
        "data" -> {
          dataStart = body
          dataLength = size
        }
      }
      offset = body + size + (size and 1)
    }
    if (dataStart < 0 || bits != 16 || channels !in 1..2 || rate <= 0) return null

    val frames = dataLength / (2 * channels)
    val mono = ShortArray(frames)
    for (i in 0 until frames) {
      var sum = 0
      for (ch in 0 until channels) sum += buf.getShort(dataStart + (i * channels + ch) * 2).toInt()
      mono[i] = (sum / channels).toShort()
    }
    return if (rate == targetRate) mono else resample(mono, rate, targetRate)
  }

  private fun resample(input: ShortArray, from: Int, to: Int): ShortArray {
    val length = (input.size.toLong() * to / from).toInt()
    val out = ShortArray(length)
    val step = from.toDouble() / to
    for (i in 0 until length) {
      val pos = i * step
      val a = pos.toInt().coerceAtMost(input.size - 1)
      val b = (a + 1).coerceAtMost(input.size - 1)
      val t = pos - a
      out[i] = (input[a] * (1 - t) + input[b] * t).toInt().toShort()
    }
    return out
  }
}
