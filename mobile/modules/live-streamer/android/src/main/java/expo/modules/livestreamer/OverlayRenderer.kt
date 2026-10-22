package expo.modules.livestreamer

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.util.Log
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import kotlin.math.min

/** One popup, as src/stage/look.ts (PopupDrawSpec) describes it. */
data class OverlaySpec(
  val kind: String,
  val text: String,
  val imageUrl: String?,
  val bg: Int,
  val fg: Int,
  val borderColor: Int?,
  val borderEm: Float,
  val shape: String,
  val rotDeg: Float,
  val fontU: Float,
  val imageU: Float,
  val anchorX: Float,
  val anchorY: Float,
  val alignX: Float,
  val alignY: Float,
  /** Entrance ("pop", "slide", "bounce", "none") and effect, played from `shownAt` (ms since 1970). */
  val entrance: String = "none",
  val effect: String = "none",
  val effectLoop: Boolean = false,
  val topRow: Boolean = false,
  /** 0 = drawn still (no entrance, no effect). */
  val shownAt: Long = 0L,
) {
  companion object {
    private const val MAX_POPUPS = 12
    private const val MAX_TEXT = 40
    private val ENTRANCES = setOf("pop", "slide", "bounce", "none")
    private val EFFECTS = setOf("none", "fireworks", "confetti", "flags", "applause", "sparkle", "hearts")

    fun parseList(json: String): List<OverlaySpec> =
      try {
        val array = JSONArray(json)
        (0 until min(array.length(), MAX_POPUPS)).mapNotNull { i -> array.optJSONObject(i)?.let(::parse) }
      } catch (error: JSONException) {
        Log.w("LiveStreamer", "bad overlay json", error)
        emptyList()
      }

    private fun parse(o: JSONObject): OverlaySpec? {
      val kind = o.optString("kind", "text")
      if (kind != "text" && kind != "image") return null
      return OverlaySpec(
        kind = kind,
        text = o.optString("text", "").take(MAX_TEXT),
        imageUrl = o.optString("imageUrl", "").takeIf { it.startsWith("https://") || it.startsWith("http://") },
        bg = color(o.optString("bg"), Color.TRANSPARENT),
        fg = color(o.optString("fg"), Color.BLACK),
        borderColor = o.optString("borderColor", "").takeIf { it.isNotEmpty() && it != "null" }?.let { color(it, Color.TRANSPARENT) },
        borderEm = o.optDouble("borderEm", 0.0).toFloat().coerceIn(0f, 1f),
        shape = o.optString("shape", "tag"),
        rotDeg = o.optDouble("rotDeg", 0.0).toFloat().coerceIn(-45f, 45f),
        fontU = o.optDouble("fontU", 6.2).toFloat().coerceIn(1f, 100f),
        imageU = o.optDouble("imageU", 24.4).toFloat().coerceIn(1f, 400f),
        anchorX = o.optDouble("anchorX", 0.5).toFloat().coerceIn(0f, 1f),
        anchorY = o.optDouble("anchorY", 0.5).toFloat().coerceIn(0f, 1f),
        alignX = o.optDouble("alignX", -0.5).toFloat().coerceIn(-1f, 0f),
        alignY = o.optDouble("alignY", -0.5).toFloat().coerceIn(-1f, 0f),
        entrance = o.optString("entrance", "none").takeIf { it in ENTRANCES } ?: "none",
        effect = o.optString("effect", "none").takeIf { it in EFFECTS } ?: "none",
        effectLoop = o.optBoolean("effectLoop", false),
        topRow = o.optBoolean("topRow", false),
        shownAt = o.optDouble("shownAt", 0.0).takeIf { it.isFinite() && it > 0 }?.toLong() ?: 0L,
      )
    }

    private fun color(value: String?, fallback: Int): Int =
      try {
        if (value.isNullOrEmpty() || value == "transparent") fallback else Color.parseColor(value)
      } catch (_: IllegalArgumentException) {
        fallback
      }
  }
}

/**
 * Draws the popups onto a transparent picture the size of the stream, each with its effect
 * underneath and its entrance animation (PopupMotion), as of `now`. The box rules match
 * the web stage (frontend/src/stage/Stage.tsx PopupView): padding 0.42em × 0.8em, circles
 * 3.2em wide, tag corners 0.28em, a 0.18em drop shadow, line height 1 and the tilt around
 * the box's centre. 1 unit = 1% of the stream's shorter side.
 */
class OverlayRenderer(private val typeface: Typeface) {

  private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    typeface = this@OverlayRenderer.typeface
    letterSpacing = -0.01f
  }
  private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
  private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
  private val imagePaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)

  /**
   * The foreground banner (if any) and then the popups, bottom to top, like the website:
   * the foreground sits above the camera and below every popup.
   */
  fun render(
    specs: List<OverlaySpec>,
    width: Int,
    height: Int,
    image: (String) -> Bitmap?,
    foreground: Bitmap? = null,
    foregroundTop: Boolean = false,
    now: Long = System.currentTimeMillis(),
  ): Bitmap {
    val bitmap = nextBuffer(width, height)
    if (specs.isEmpty() && foreground == null) return bitmap
    val canvas = Canvas(bitmap)
    if (foreground != null) drawForeground(canvas, foreground, foregroundTop, width, height)
    val unit = min(width, height) / 100f
    for (spec in specs) {
      if (spec.kind == "image") {
        spec.imageUrl?.let(image)?.let { drawImage(canvas, spec, it, unit, width, height, now) }
      } else if (spec.text.isNotBlank()) {
        drawText(canvas, spec, unit, width, height, now)
      }
    }
    return bitmap
  }

  // Reused output pictures: a moving GIF redraws the overlay many times a second, and a new
  // stream-sized bitmap each time would churn megabytes. Three, so the one the GPU may still be
  // uploading is never drawn over (RootEncoder uploads the latest on its next frame).
  private val buffers = arrayOfNulls<Bitmap>(3)
  private var nextIndex = 0

  private fun nextBuffer(width: Int, height: Int): Bitmap {
    val index = nextIndex
    nextIndex = (nextIndex + 1) % buffers.size
    val reuse = buffers[index]?.takeIf { it.width == width && it.height == height }
    if (reuse != null) {
      reuse.eraseColor(Color.TRANSPARENT)
      return reuse
    }
    return Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also { buffers[index] = it }
  }

  /** Full width at its own aspect ratio, docked to the top or bottom (Stage.tsx ForegroundLayer). */
  private fun drawForeground(canvas: Canvas, picture: Bitmap, top: Boolean, width: Int, height: Int) {
    if (picture.width <= 0 || picture.height <= 0) return
    val h = width.toFloat() * picture.height / picture.width
    val y = if (top) 0f else height - h
    canvas.drawBitmap(picture, null, RectF(0f, y, width.toFloat(), y + h), imagePaint)
  }

  /**
   * The effect (under the popup, around its centre, sized in em of its font) and then the
   * entrance: scale around the box's centre, a slide up, and a fade. Returns the save count
   * to restore once the popup is drawn.
   */
  private fun beginPopup(canvas: Canvas, spec: OverlaySpec, box: RectF, unit: Float, now: Long): Int {
    PopupMotion.drawEffect(canvas, spec, box.centerX(), box.centerY(), spec.fontU * unit, now)
    val restoreTo = canvas.save()
    if (spec.shownAt <= 0L) return restoreTo
    val frame = PopupMotion.entrance(spec.entrance, now - spec.shownAt)
    if (frame.alpha < 1f) canvas.saveLayerAlpha(null, (frame.alpha.coerceIn(0f, 1f) * 255).toInt())
    canvas.translate(0f, frame.dropU * unit)
    if (frame.scale != 1f) canvas.scale(frame.scale, frame.scale, box.centerX(), box.centerY())
    return restoreTo
  }

  private fun drawText(canvas: Canvas, spec: OverlaySpec, unit: Float, width: Int, height: Int, now: Long) {
    val fontPx = spec.fontU * unit
    textPaint.textSize = fontPx
    textPaint.color = spec.fg
    val textWidth = textPaint.measureText(spec.text)
    val border = if (spec.borderColor != null) spec.borderEm * fontPx else 0f

    val circle = spec.shape == "circle"
    val boxW = (if (circle) 3.2f * fontPx else textWidth + 1.6f * fontPx) + 2 * border
    val boxH = (if (circle) 3.2f * fontPx else fontPx + 0.84f * fontPx) + 2 * border
    val left = spec.anchorX * width + spec.alignX * boxW
    val top = spec.anchorY * height + spec.alignY * boxH
    val rect = RectF(left, top, left + boxW, top + boxH)
    val radius = when (spec.shape) {
      "circle" -> boxW / 2f
      "pill" -> boxH / 2f
      else -> 0.28f * fontPx
    }

    val restoreTo = beginPopup(canvas, spec, rect, unit, now)
    canvas.rotate(spec.rotDeg, rect.centerX(), rect.centerY())

    val shadow = RectF(rect).apply { offset(0f, 0.18f * fontPx) }
    fillPaint.color = Color.argb(89, 0, 0, 0)
    canvas.drawRoundRect(shadow, radius, radius, fillPaint)

    fillPaint.color = spec.bg
    canvas.drawRoundRect(rect, radius, radius, fillPaint)

    if (border > 0f && spec.borderColor != null) {
      strokePaint.color = spec.borderColor
      strokePaint.strokeWidth = border
      val inset = RectF(rect).apply { inset(border / 2f, border / 2f) }
      canvas.drawRoundRect(inset, (radius - border / 2f).coerceAtLeast(0f), (radius - border / 2f).coerceAtLeast(0f), strokePaint)
    }

    val metrics = textPaint.fontMetrics
    val baseline = rect.centerY() - (metrics.ascent + metrics.descent) / 2f
    canvas.drawText(spec.text, rect.centerX() - textWidth / 2f, baseline, textPaint)
    canvas.restoreToCount(restoreTo)
  }

  private fun drawImage(canvas: Canvas, spec: OverlaySpec, picture: Bitmap, unit: Float, width: Int, height: Int, now: Long) {
    if (picture.height <= 0) return
    val h = spec.imageU * unit
    val w = h * picture.width / picture.height
    val left = spec.anchorX * width + spec.alignX * w
    val top = spec.anchorY * height + spec.alignY * h
    val box = RectF(left, top, left + w, top + h)
    val restoreTo = beginPopup(canvas, spec, box, unit, now)
    canvas.drawBitmap(picture, null, box, imagePaint)
    canvas.restoreToCount(restoreTo)
  }
}
