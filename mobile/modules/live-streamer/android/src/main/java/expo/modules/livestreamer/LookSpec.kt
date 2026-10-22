package expo.modules.livestreamer

import android.util.Log
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/**
 * The camera picture's look, as src/stage/stageLook.ts (NativeLook) sends it: already in
 * the shader's units, so nothing here re-derives the website's formulas. Every value is
 * clamped, and anything missing falls back to "unchanged", so a bad message can only ever
 * show the plain camera.
 */
data class LookSpec(
  val mirror: Boolean = false,
  val zoom: Float = 1f,
  /** The camera's own zoom: below 1 shows more (0.5 = the wide lens, where the phone has one). */
  val lensZoom: Float = 1f,
  val brightness: Float = 1f,
  val contrast: Float = 1f,
  val saturation: Float = 1f,
  val warmth: Float = 0f,
  val smoothing: Float = 0f,
  val filter: FilterSpec = FilterSpec(),
  val background: BackgroundSpec = BackgroundSpec(),
  val foreground: ForegroundSpec? = null,
) {
  companion object {
    fun parse(json: String): LookSpec =
      try {
        val o = JSONObject(json)
        LookSpec(
          mirror = o.optBoolean("mirror", false),
          zoom = o.float("zoom", 1f, 1f, 2f),
          lensZoom = o.float("lensZoom", 1f, 0.5f, 1f),
          brightness = o.float("brightness", 1f, 0.5f, 1.5f),
          contrast = o.float("contrast", 1f, 0.5f, 1.5f),
          saturation = o.float("saturation", 1f, 0f, 2f),
          warmth = o.float("warmth", 0f, -1f, 1f),
          smoothing = o.float("smoothing", 0f, 0f, 1f),
          filter = o.optJSONObject("filter")?.let(FilterSpec::parse) ?: FilterSpec(),
          background = o.optJSONObject("background")?.let(BackgroundSpec::parse) ?: BackgroundSpec(),
          foreground = o.optJSONObject("foreground")?.let(ForegroundSpec::parse),
        )
      } catch (error: JSONException) {
        Log.w("LiveStreamer", "bad look json", error)
        LookSpec()
      }
  }
}

data class FilterSpec(
  val strength: Float = 0f,
  val gain: FloatArray = floatArrayOf(1f, 1f, 1f),
  val contrast: Float = 1f,
  val saturation: Float = 1f,
  val fade: Float = 0f,
  val shadows: FloatArray = floatArrayOf(0f, 0f, 0f),
  val highlights: FloatArray = floatArrayOf(0f, 0f, 0f),
  val mono: Float = 0f,
  val vignette: Float = 0f,
  val grain: Float = 0f,
) {
  companion object {
    fun parse(o: JSONObject) = FilterSpec(
      strength = o.float("strength", 0f, 0f, 1f),
      gain = o.vec3("gain", 1f, 0f, 2f),
      contrast = o.float("contrast", 1f, 0f, 2f),
      saturation = o.float("saturation", 1f, 0f, 2f),
      fade = o.float("fade", 0f, 0f, 0.5f),
      shadows = o.vec3("shadows", 0f, -0.5f, 0.5f),
      highlights = o.vec3("highlights", 0f, -0.5f, 0.5f),
      mono = o.float("mono", 0f, 0f, 1f),
      vignette = o.float("vignette", 0f, 0f, 1f),
      grain = o.float("grain", 0f, 0f, 0.3f),
    )
  }

  // Arrays compare by content, so an unchanged look is recognised as unchanged.
  override fun equals(other: Any?): Boolean =
    other is FilterSpec && strength == other.strength && gain.contentEquals(other.gain) && contrast == other.contrast &&
      saturation == other.saturation && fade == other.fade && shadows.contentEquals(other.shadows) &&
      highlights.contentEquals(other.highlights) && mono == other.mono && vignette == other.vignette && grain == other.grain

  override fun hashCode(): Int = arrayOf<Any?>(strength, gain.contentHashCode(), contrast, saturation, fade, shadows.contentHashCode(), highlights.contentHashCode(), mono, vignette, grain).contentHashCode()
}

enum class BackgroundMode(val shaderValue: Float) {
  NONE(0f),
  BLUR(1f),
  PICTURE(2f),
  GREEN(3f);

  val needsMask get() = this == BLUR || this == PICTURE
  val showsPicture get() = this == PICTURE || this == GREEN
}

data class BackgroundSpec(
  val mode: BackgroundMode = BackgroundMode.NONE,
  /** A bundled backdrop (assets/livestreamer/backgrounds/<preset>.jpg). */
  val preset: String = "rack",
  /** The seller's own photo; wins over the preset when set. */
  val imageUrl: String? = null,
  val tone: Int = DEFAULT_TONE,
  val key: FloatArray = floatArrayOf(0f, 0.69f, 0.25f),
  val similarity: Float = 0.1796f,
  val smoothness: Float = 0.038f,
) {
  /** Where the picture behind the person comes from, or null when none is shown. */
  val pictureSource: String?
    get() = when {
      !mode.showsPicture -> null
      imageUrl != null -> imageUrl
      else -> "asset:livestreamer/backgrounds/$preset.jpg"
    }

  companion object {
    private val PRESETS = setOf("loft", "rack", "kitchen", "vanity", "brand", "white")
    /** #24324A, the Boutique rack backdrop's tone. */
    const val DEFAULT_TONE: Int = 0xFF24324A.toInt()

    fun parse(o: JSONObject) = BackgroundSpec(
      mode = when (o.optString("mode")) {
        "blur" -> BackgroundMode.BLUR
        "image" -> BackgroundMode.PICTURE
        "green" -> BackgroundMode.GREEN
        else -> BackgroundMode.NONE
      },
      preset = o.optString("preset").takeIf { it in PRESETS } ?: "rack",
      imageUrl = o.optString("imageUrl", "").takeIf { it.startsWith("https://") || it.startsWith("http://") },
      tone = parseHexColor(o.optString("tone", "")) ?: DEFAULT_TONE,
      key = o.vec3("key", 0f, 0f, 1f).takeIf { o.has("key") } ?: floatArrayOf(0f, 0.69f, 0.25f),
      similarity = o.float("similarity", 0.1796f, 0f, 1f),
      smoothness = o.float("smoothness", 0.038f, 0.001f, 1f),
    )
  }

  override fun equals(other: Any?): Boolean =
    other is BackgroundSpec && mode == other.mode && preset == other.preset && imageUrl == other.imageUrl && tone == other.tone &&
      key.contentEquals(other.key) && similarity == other.similarity && smoothness == other.smoothness

  override fun hashCode(): Int = arrayOf<Any?>(mode, preset, imageUrl, tone, key.contentHashCode(), similarity, smoothness).contentHashCode()
}

data class ForegroundSpec(val url: String, val dockTop: Boolean) {
  companion object {
    fun parse(o: JSONObject): ForegroundSpec? {
      val url = o.optString("url", "")
      if (!url.startsWith("https://") && !url.startsWith("http://")) return null
      return ForegroundSpec(url, o.optString("dock") == "top")
    }
  }
}

/** "#RRGGBB" → opaque ARGB, or null. (Plain Kotlin, so it also runs in JVM tests.) */
fun parseHexColor(value: String): Int? {
  if (!Regex("^#[0-9a-fA-F]{6}$").matches(value)) return null
  return (0xFF000000 or value.substring(1).toLong(16)).toInt()
}

private fun JSONObject.float(name: String, fallback: Float, min: Float, max: Float): Float {
  val v = optDouble(name, Double.NaN)
  return if (v.isNaN() || v.isInfinite()) fallback else v.toFloat().coerceIn(min, max)
}

private fun JSONObject.vec3(name: String, fallback: Float, min: Float, max: Float): FloatArray {
  val a: JSONArray = optJSONArray(name) ?: return floatArrayOf(fallback, fallback, fallback)
  return FloatArray(3) { i ->
    val v = a.optDouble(i, fallback.toDouble())
    if (v.isNaN() || v.isInfinite()) fallback else v.toFloat().coerceIn(min, max)
  }
}
