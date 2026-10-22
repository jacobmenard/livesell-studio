package expo.modules.livestreamer

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import androidx.core.graphics.PathParser
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.sin

/**
 * The website's popup entrances and effects (frontend/src/index.css keyframes and
 * frontend/src/stage/fx.ts particle layouts), drawn frame by frame onto the overlay.
 * Same timings, easing curves and particle positions; sizes in em of the popup's font
 * size, so effects scale with the popup exactly as on the clean screen.
 */
object PopupMotion {

  // ---- timing ------------------------------------------------------------------------------

  /** A CSS cubic-bezier() timing function. */
  class Ease(private val x1: Float, private val y1: Float, private val x2: Float, private val y2: Float) {
    fun at(t: Float): Float {
      if (t <= 0f) return 0f
      if (t >= 1f) return 1f
      // x(s) rises monotonically for CSS curves: find s with x(s) = t, then return y(s).
      var lo = 0f
      var hi = 1f
      var s = t
      repeat(18) {
        s = (lo + hi) / 2f
        if (bezier(s, x1, x2) < t) lo = s else hi = s
      }
      return bezier(s, y1, y2)
    }

    private fun bezier(s: Float, a: Float, b: Float): Float {
      val u = 1f - s
      return 3f * u * u * s * a + 3f * u * s * s * b + s * s * s
    }
  }

  private val EASE = Ease(0.25f, 0.1f, 0.25f, 1f)
  private val EASE_OUT = Ease(0f, 0f, 0.58f, 1f)
  private val EASE_IN_OUT = Ease(0.42f, 0f, 0.58f, 1f)
  private val POP = Ease(0.2f, 1.6f, 0.4f, 1f)
  private val BURST = Ease(0.12f, 0.75f, 0.3f, 1f)

  /**
   * A keyframe track: `values` at `stops` (0–1), eased within each segment as CSS does.
   * A null ease is linear.
   */
  private fun track(p: Float, stops: FloatArray, values: FloatArray, ease: Ease?): Float {
    if (p <= stops[0]) return values[0]
    for (i in 1 until stops.size) {
      if (p <= stops[i]) {
        val local = (p - stops[i - 1]) / (stops[i] - stops[i - 1])
        val eased = ease?.at(local) ?: local
        return values[i - 1] + (values[i] - values[i - 1]) * eased
      }
    }
    return values[values.size - 1]
  }

  /**
   * Where a CSS animation with `fill: both` is: its first keyframe before the delay, its last
   * once finished (unless it loops), else 0–1 through the current run.
   */
  private fun progress(elapsedMs: Long, delayMs: Float, durationMs: Float, loop: Boolean): Float {
    val t = elapsedMs - delayMs
    if (t <= 0f) return 0f
    if (!loop) return (t / durationMs).coerceAtMost(1f)
    val runs = t / durationMs
    return runs - floor(runs)
  }

  // ---- entrances -----------------------------------------------------------------------------

  /** How an entrance changes the popup right now: scale around its centre, a drop, and opacity. */
  data class EntranceFrame(val scale: Float, val dropU: Float, val alpha: Float)

  private val STILL = EntranceFrame(1f, 0f, 1f)

  private fun entranceMs(entrance: String): Long = when (entrance) {
    "pop" -> 450L
    "slide" -> 400L
    "bounce" -> 900L
    else -> 0L
  }

  fun entrance(entrance: String, elapsedMs: Long): EntranceFrame {
    val duration = entranceMs(entrance)
    if (duration == 0L || elapsedMs >= duration) return STILL
    val p = elapsedMs.coerceAtLeast(0L).toFloat() / duration
    return when (entrance) {
      // scale(0) → scale(1), overshooting a little on the way.
      "pop" -> EntranceFrame(POP.at(p), 0f, 1f)
      // 40 px up on the web's 1080 px clean screen: about 4 stage units.
      "slide" -> EASE_OUT.at(p).let { e -> EntranceFrame(1f, SLIDE_U * (1f - e), e) }
      else -> EntranceFrame(
        track(p, floatArrayOf(0f, 0.5f, 0.7f, 1f), floatArrayOf(0.3f, 1.12f, 0.94f, 1f), EASE),
        0f,
        track(p, floatArrayOf(0f, 0.5f, 1f), floatArrayOf(0f, 1f, 1f), EASE),
      )
    }
  }

  private const val SLIDE_U = 4f

  // ---- effects -------------------------------------------------------------------------------

  private val COLORS = intArrayOf(0xFFF5C542.toInt(), 0xFFFF5A36.toInt(), 0xFF8AB4FF.toInt(), 0xFFC6F36B.toInt(), 0xFFF2A3B8.toInt(), 0xFFF4F1EA.toInt())
  private val CREAM = 0xFFF4F1EA.toInt()

  /** fx.ts rnd(): the same deterministic noise, so particles sit where the website puts them. */
  private fun rnd(i: Int, seed: Int): Float {
    val x = sin(i * 12.9898 + seed * 78.233) * 43758.5453
    return (x - floor(x)).toFloat()
  }

  /** One particle, in em from the popup's centre. */
  private class Part(val x: Float, val y: Float, val rotDeg: Float, val color: Int, val delayMs: Float, val alt: Boolean, val size: Float, val width: Float, val durationMs: Float)

  private val fireworks: List<Part> by lazy {
    val bursts = arrayOf(floatArrayOf(-3.2f, -1.6f, 0f), floatArrayOf(3.4f, -2.2f, 450f), floatArrayOf(0.2f, -3.4f, 900f))
    bursts.flatMapIndexed { bi, b ->
      (0 until 12).map { i -> Part(b[0], b[1], (i * 30 + bi * 10).toFloat(), COLORS[(i + bi * 2) % COLORS.size], b[2], i % 2 == 1, 0f, 0f, 1300f) }
    }
  }

  private val confetti: List<Part> by lazy {
    (0 until 26).map { i ->
      Part(-6f + 12f * rnd(i, 1), -3.5f, 0f, COLORS[i % COLORS.size], rnd(i, 2) * 1200f, i % 2 == 1, 0f, if (i % 3 != 0) 0.3f else 0.45f, 1600f + rnd(i, 3) * 900f)
    }
  }

  private val applause: List<Part> by lazy {
    (0 until 8).map { i ->
      val rot = (if (i % 2 == 1) 1 else -1) * (10f + rnd(i, 5) * 15f)
      Part(-4f + i * (8f / 7f), 0.8f + rnd(i, 4) * 0.6f, Math.round(rot).toFloat(), COLORS[i % COLORS.size], i * 180f, false, 1.2f, 0f, 1600f)
    }
  }

  private val sparkles: List<Part> by lazy {
    (0 until 10).map { i ->
      val angle = Math.toRadians(i * 36.0)
      val r = 1.6f + rnd(i, 6) * 0.9f
      Part((cos(angle) * r * 2.2f).toFloat(), (sin(angle) * r).toFloat(), 0f, if (i % 3 != 0) 0xFFF5C542.toInt() else CREAM, rnd(i, 8) * 1200f, false, 0.5f + rnd(i, 7) * 0.45f, 0f, 1200f)
    }
  }

  private val hearts: List<Part> by lazy {
    val tones = intArrayOf(0xFFFF5A36.toInt(), 0xFFF2A3B8.toInt(), 0xFFFF8FA3.toInt())
    (0 until 9).map { i -> Part(-3f + rnd(i, 9) * 6f, 0.6f, 0f, tones[i % 3], i * 200f, false, 0.7f + rnd(i, 10) * 0.4f, 0f, 2000f) }
  }

  private const val FLAGS = 9

  /** How long an effect runs once (its last particle's delay + duration); banderitas never stop. */
  private fun effectMs(effect: String): Long = when (effect) {
    "fireworks" -> 2200L
    "confetti" -> 3700L
    "applause" -> 2860L
    "sparkle" -> 2400L
    "hearts" -> 3600L
    "flags" -> Long.MAX_VALUE
    else -> 0L
  }

  /** Whether this popup still changes from frame to frame (so the overlay must keep redrawing). */
  fun moves(spec: OverlaySpec, now: Long): Boolean {
    if (spec.shownAt <= 0L) return false
    val elapsed = now - spec.shownAt
    if (elapsed < entranceMs(spec.entrance)) return true
    if (spec.effect == "none" || effectMs(spec.effect) == 0L) return false
    return spec.effectLoop || elapsed < effectMs(spec.effect)
  }

  // Paths from the website's SVG icons (24 × 24 view box).
  private val HAND: Path by lazy {
    PathParser.createPathFromPathData(
      "M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" +
        "M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15",
    )
  }
  private val STAR: Path by lazy { PathParser.createPathFromPathData("M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z") }
  private val HEART: Path by lazy {
    PathParser.createPathFromPathData("M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z")
  }

  private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
  private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeCap = Paint.Cap.ROUND
    strokeJoin = Paint.Join.ROUND
  }
  private val rect = RectF()
  private val triangle = Path()

  /**
   * Draws `spec`'s effect around (cx, cy), the popup's centre, `em` px per em, below the popup
   * itself (the website stacks effects under the popup). Main thread only (shared paints).
   */
  fun drawEffect(canvas: Canvas, spec: OverlaySpec, cx: Float, cy: Float, em: Float, now: Long) {
    if (spec.shownAt <= 0L || spec.effect == "none") return
    val elapsed = (now - spec.shownAt).coerceAtLeast(0L)
    canvas.save()
    canvas.translate(cx, cy)
    when (spec.effect) {
      "fireworks" -> drawFireworks(canvas, em, elapsed, spec.effectLoop)
      "confetti" -> drawConfetti(canvas, em, elapsed, spec.effectLoop)
      "flags" -> drawFlags(canvas, em, elapsed, spec.topRow)
      "applause" -> drawIcons(canvas, applause, em, elapsed, spec.effectLoop, ::applauseFrame, HAND, 1.2f, filled = false)
      "sparkle" -> drawIcons(canvas, sparkles, em, elapsed, spec.effectLoop, ::sparkleFrame, STAR, 0f, filled = true)
      "hearts" -> drawIcons(canvas, hearts, em, elapsed, spec.effectLoop, ::heartFrame, HEART, 0f, filled = true)
    }
    canvas.restore()
  }

  private fun alpha(color: Int, opacity: Float): Int = Color.argb((Color.alpha(color) * opacity.coerceIn(0f, 1f)).toInt(), Color.red(color), Color.green(color), Color.blue(color))

  // ls-fwa / ls-fwb: each spark flies out along its angle, shrinking, fading in fast and out late.
  private fun drawFireworks(canvas: Canvas, em: Float, elapsed: Long, loop: Boolean) {
    for (part in fireworks) {
      val p = progress(elapsed, part.delayMs, part.durationMs, loop)
      val opacity = track(p, floatArrayOf(0f, 0.06f, 0.7f, 1f), floatArrayOf(0f, 1f, 1f, 0f), BURST)
      if (opacity <= 0.01f) continue
      val e = BURST.at(p)
      val distance = (if (part.alt) 1.9f else 2.8f) * e
      val scale = 1f - 0.65f * e
      val angle = Math.toRadians(part.rotDeg.toDouble())
      val x = (part.x + distance * sin(angle).toFloat()) * em
      val y = (part.y - distance * cos(angle).toFloat()) * em
      // The glow (box-shadow 0.35em), then the 0.2em spark.
      fill.color = alpha(part.color, opacity * 0.35f)
      canvas.drawCircle(x, y, 0.27f * em * scale, fill)
      fill.color = alpha(part.color, opacity)
      canvas.drawCircle(x, y, 0.1f * em * scale, fill)
    }
  }

  // ls-cfa / ls-cfb: strips fall 7em, spinning, one kind drifting right.
  private fun drawConfetti(canvas: Canvas, em: Float, elapsed: Long, loop: Boolean) {
    for (part in confetti) {
      val p = progress(elapsed, part.delayMs, part.durationMs, loop)
      val opacity = track(p, floatArrayOf(0f, 0.08f, 0.85f, 1f), floatArrayOf(0f, 1f, 1f, 0f), null)
      if (opacity <= 0.01f) continue
      val dx = if (part.alt) 0.8f * p else 0f
      val spin = if (part.alt) -480f * p else 540f * p
      val w = part.width * em
      val h = 0.6f * em
      canvas.save()
      canvas.translate((part.x + dx) * em + w / 2f, (part.y + 7f * p) * em + h / 2f)
      canvas.rotate(spin)
      fill.color = alpha(part.color, opacity)
      rect.set(-w / 2f, -h / 2f, w / 2f, h / 2f)
      canvas.drawRoundRect(rect, 0.08f * em, 0.08f * em, fill)
      canvas.restore()
    }
  }

  // Banderitas: a string of 9 pennants that drops in (ls-drop) and keeps swaying (ls-flag).
  private fun drawFlags(canvas: Canvas, em: Float, elapsed: Long, topRow: Boolean) {
    val drop = (elapsed / 500f).coerceIn(0f, 1f)
    val eased = EASE_OUT.at(drop)
    val opacity = eased
    val top = ((if (topRow) 1.3f else -3.2f) - 1f + eased) * em
    val left = -5.5f * em
    val width = 11f * em

    fill.color = alpha(CREAM, opacity)
    rect.set(left, top, left + width, top + 0.07f * em)
    canvas.drawRoundRect(rect, 0.035f * em, 0.035f * em, fill)

    val flagW = 0.95f * em
    val flagH = 1.2f * em
    val gap = (10.6f * em - FLAGS * flagW) / (FLAGS - 1)
    for (i in 0 until FLAGS) {
      // 1.4 s each way, started i × 0.16 s in (negative delays), alternating direction.
      val runs = (elapsed + i * 160f) / 1400f
      val n = floor(runs).toInt()
      val frac = runs - n
      val directed = if (n % 2 == 0) frac else 1f - frac
      val angle = -9f + 18f * EASE_IN_OUT.at(directed)
      val flagLeft = left + 0.2f * em + i * (flagW + gap)
      canvas.save()
      canvas.translate(flagLeft + flagW / 2f, top + 0.07f * em)
      canvas.rotate(angle)
      triangle.reset()
      triangle.moveTo(-flagW / 2f, 0f)
      triangle.lineTo(flagW / 2f, 0f)
      triangle.lineTo(0f, flagH)
      triangle.close()
      fill.color = alpha(COLORS[i % COLORS.size], opacity)
      canvas.drawPath(triangle, fill)
      canvas.restore()
    }
  }

  /** One icon particle's movement: offset (em), extra rotation (deg), scale and opacity. */
  private class IconFrame(val dx: Float, val dy: Float, val rotDeg: Float, val scale: Float, val opacity: Float)

  // ls-apl: hands rise 3.6em, rocking side to side.
  private fun applauseFrame(p: Float) = IconFrame(
    0f,
    track(p, floatArrayOf(0f, 0.15f, 0.35f, 0.55f, 1f), floatArrayOf(0f, -0.4f, -1.2f, -2f, -3.6f), EASE_OUT),
    track(p, floatArrayOf(0f, 0.15f, 0.35f, 0.55f, 1f), floatArrayOf(0f, 0f, -14f, 14f, 0f), EASE_OUT),
    track(p, floatArrayOf(0f, 0.15f, 1f), floatArrayOf(0.4f, 1f, 1f), EASE_OUT),
    track(p, floatArrayOf(0f, 0.15f, 0.8f, 1f), floatArrayOf(0f, 1f, 1f, 0f), EASE_OUT),
  )

  // ls-spk: stars grow and shrink while turning half a turn.
  private fun sparkleFrame(p: Float): IconFrame {
    val grow = track(p, floatArrayOf(0f, 0.5f, 1f), floatArrayOf(0f, 1f, 0f), EASE_IN_OUT)
    return IconFrame(0f, 0f, track(p, floatArrayOf(0f, 0.5f, 1f), floatArrayOf(0f, 90f, 180f), EASE_IN_OUT), grow, grow)
  }

  // ls-hrt: hearts float 4.5em up, drifting right then left.
  private fun heartFrame(p: Float) = IconFrame(
    track(p, floatArrayOf(0f, 0.15f, 0.5f, 1f), floatArrayOf(0f, 0f, 0.4f, -0.3f), EASE_OUT),
    track(p, floatArrayOf(0f, 0.15f, 0.5f, 1f), floatArrayOf(0f, -0.5f, -2.2f, -4.5f), EASE_OUT),
    0f,
    track(p, floatArrayOf(0f, 0.15f, 0.5f, 1f), floatArrayOf(0.3f, 1f, 1f, 0.8f), EASE_OUT),
    track(p, floatArrayOf(0f, 0.15f, 0.8f, 1f), floatArrayOf(0f, 1f, 0.9f, 0f), EASE_OUT),
  )

  /** Icons centred on their spot; `fixedSize` em (applause) or each particle's own size. */
  private fun drawIcons(
    canvas: Canvas,
    parts: List<Part>,
    em: Float,
    elapsed: Long,
    loop: Boolean,
    frame: (Float) -> IconFrame,
    icon: Path,
    fixedSize: Float,
    filled: Boolean,
  ) {
    for (part in parts) {
      val f = frame(progress(elapsed, part.delayMs, part.durationMs, loop))
      if (f.opacity <= 0.01f || f.scale <= 0.001f) continue
      val sizePx = (if (fixedSize > 0f) fixedSize else part.size) * em
      canvas.save()
      canvas.translate(part.x * em, part.y * em)
      canvas.rotate(part.rotDeg)
      canvas.translate(f.dx * em, f.dy * em)
      canvas.rotate(f.rotDeg)
      canvas.scale(f.scale * sizePx / 24f, f.scale * sizePx / 24f)
      canvas.translate(-12f, -12f)
      if (filled) {
        fill.color = alpha(part.color, f.opacity)
        canvas.drawPath(icon, fill)
      } else {
        stroke.color = alpha(part.color, f.opacity)
        stroke.strokeWidth = 2.2f
        canvas.drawPath(icon, stroke)
      }
      canvas.restore()
    }
  }
}
