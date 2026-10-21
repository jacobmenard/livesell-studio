package expo.modules.livestreamer

import com.pedro.encoder.input.audio.CustomAudioEffect

/**
 * Mixes sound effects into the microphone audio before it is encoded, so viewers hear a
 * clean "ka-ching" and the microphone never picks it up from the speaker. Runs on the
 * microphone thread; `play` may be called from any thread.
 *
 * Audio is 16-bit little-endian PCM at 44.1 kHz (see LiveStreamerView.SAMPLE_RATE); effects
 * are mono and copied to every channel.
 */
class SoundMixer : CustomAudioEffect() {

  private class Voice(val samples: ShortArray, val gain: Float) {
    var position = 0
  }

  private val lock = Any()
  private val voices = ArrayList<Voice>()

  @Volatile var channels: Int = 2

  /** The seller's mute button: silences the microphone, effects still play. */
  @Volatile var micMuted: Boolean = false

  fun play(samples: ShortArray, gain: Float) {
    synchronized(lock) {
      // A seller hammering a pad shouldn't pile up a wall of noise.
      if (voices.size >= MAX_VOICES) voices.removeAt(0)
      voices.add(Voice(samples, gain))
    }
  }

  override fun process(pcmBuffer: ByteArray): ByteArray {
    val muted = micMuted
    val active = synchronized(lock) { if (voices.isEmpty()) null else voices.toList() }
    if (active == null && !muted) return pcmBuffer

    val out = ByteArray(pcmBuffer.size)
    val channelCount = channels.coerceIn(1, 2)
    val frames = pcmBuffer.size / (2 * channelCount)

    for (frame in 0 until frames) {
      var effect = 0f
      if (active != null) {
        for (voice in active) {
          val i = voice.position + frame
          if (i < voice.samples.size) effect += voice.samples[i] * voice.gain
        }
      }
      for (ch in 0 until channelCount) {
        val index = (frame * channelCount + ch) * 2
        val mic = if (muted) 0 else ((pcmBuffer[index + 1].toInt() shl 8) or (pcmBuffer[index].toInt() and 0xFF)).toShort().toInt()
        val mixed = (mic + effect).toInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt())
        out[index] = (mixed and 0xFF).toByte()
        out[index + 1] = ((mixed shr 8) and 0xFF).toByte()
      }
    }

    if (active != null) {
      synchronized(lock) {
        for (voice in active) voice.position += frames
        voices.removeAll { it.position >= it.samples.size }
      }
    }
    return out
  }

  companion object {
    private const val MAX_VOICES = 6
  }
}
