package expo.modules.livestreamer

import android.content.Context
import android.content.res.AssetManager
import android.graphics.Bitmap
import android.graphics.Color
import android.opengl.GLES20
import android.opengl.GLUtils
import android.opengl.Matrix
import android.os.SystemClock
import android.util.Log
import com.pedro.encoder.input.gl.render.filters.BaseFilterRender
import com.pedro.encoder.utils.gl.GlUtil
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * The camera picture of the live, drawn on the GPU in RootEncoder's filter chain (before the
 * popups): zoom and mirror, the seller's look and colour filter, face enhance, and the
 * background (blurred room, picture behind the person, or green screen).
 *
 * Shaders: assets/livestreamer/shaders (stage.frag is a copy of the website's enhance.ts and
 * chroma.ts maths). Passes per frame, all on the GL thread:
 *  1. Blur only: the camera as drawn, shrunk to a quarter, blurred across then down.
 *  2. Blur and Picture: whenever ML Kit is free, a ~256 px copy is read back and handed to it,
 *     and the full frame is kept (one of two "held" frames). When that frame's person mask
 *     comes back, the stage draws that held frame with it, not the newest camera frame: a mask
 *     laid over a later frame leaves the room showing wherever the seller just moved from.
 *     So the picture runs a few frames behind the camera, at ML Kit's pace.
 *  3. The stage pass into this filter's own target (RootEncoder draws the quad after this).
 *
 * RootEncoder releases every filter when the preview stops while not live, and initialises it
 * again when it's added back, so all GL objects are (re)made in initGlFilter and the CPU-side
 * picture and mask are kept to be uploaded again.
 */
class StageFilterRender(private val assets: AssetManager, private val segmenter: PersonSegmenter) : BaseFilterRender() {

  /** Written from the UI thread, read on the GL thread. */
  @Volatile var look: LookSpec = LookSpec()

  /** CameraFraming.crop: the middle part of the camera that fills the live (1, 1 = all of it). */
  @Volatile var crop: FloatArray = floatArrayOf(1f, 1f)

  private val pendingPicture = AtomicReference<Picture?>(null)
  private var picture: Picture? = null
  private var pictureDirty = false

  private class Picture(val bitmap: Bitmap?, val source: String?)

  // ---- GL objects ------------------------------------------------------------------------

  private class Program(val id: Int) {
    val position = GLES20.glGetAttribLocation(id, "aPosition")
    val textureCoord = GLES20.glGetAttribLocation(id, "aTextureCoord")
    val mvp = GLES20.glGetUniformLocation(id, "uMVPMatrix")
    val st = GLES20.glGetUniformLocation(id, "uSTMatrix")
    private val cache = HashMap<String, Int>()
    fun u(name: String): Int = cache.getOrPut(name) { GLES20.glGetUniformLocation(id, name) }
  }

  private class Target(val width: Int, val height: Int) {
    val fbo = IntArray(1)
    val texture = IntArray(1)
  }

  private var stage: Program? = null
  private var view: Program? = null
  private var blur: Program? = null
  private var low: Target? = null
  private var lowB: Target? = null
  private var seg: Target? = null
  private val maskTexture = IntArray(1)
  private val pictureTexture = IntArray(1)
  private var hasMaskTexture = false
  private var uploadedMaskFrame = -1L

  // Camera frames handed to ML Kit, kept full size until their mask is back: one waiting for
  // its mask, one on screen with the mask it was found in.
  private val held = arrayOfNulls<Target>(2)
  private val heldFrame = LongArray(2) { -1L }
  private val heldAt = LongArray(2)
  /** The held frame on screen (the uploaded mask is its own), or -1 for the live camera. */
  private var shownHeld = -1
  private var nextFrameId = 0L
  private var pictureWidth = 0
  private var pictureHeight = 0
  private var hasPictureTexture = false

  private var segPixels: ByteBuffer? = null
  private var segBitmap: Bitmap? = null

  private val identity = FloatArray(16).also { Matrix.setIdentityM(it, 0) }
  /** Draws a pass upside down, so glReadPixels (bottom row first) returns an upright picture. */
  private val flipY = FloatArray(16).also {
    Matrix.setIdentityM(it, 0)
    Matrix.translateM(it, 0, 0f, 1f, 0f)
    Matrix.scaleM(it, 0, 1f, -1f, 1f)
  }

  init {
    // RootEncoder's quad: X, Y, Z, U, V.
    val quad = floatArrayOf(
      -1f, -1f, 0f, 0f, 0f,
      1f, -1f, 0f, 1f, 0f,
      -1f, 1f, 0f, 0f, 1f,
      1f, 1f, 0f, 1f, 1f,
    )
    squareVertex = ByteBuffer.allocateDirect(quad.size * FLOAT_SIZE_BYTES).order(ByteOrder.nativeOrder()).asFloatBuffer()
    squareVertex.put(quad).position(0)
    Matrix.setIdentityM(MVPMatrix, 0)
    Matrix.setIdentityM(STMatrix, 0)
  }

  /**
   * The picture behind the person (a bundled backdrop or the seller's photo), or null while
   * it loads (its tone shows meanwhile). `source` tells a late download from the current one.
   */
  fun setPicture(bitmap: Bitmap?, source: String?) {
    pendingPicture.set(Picture(bitmap, source))
  }

  override fun initGlFilter(context: Context) {
    val vertex = shader("stage.vert")
    stage = Program(GlUtil.createProgram(vertex, shader("stage.frag")))
    view = Program(GlUtil.createProgram(vertex, shader("view.frag")))
    blur = Program(GlUtil.createProgram(vertex, shader("blur.frag")))
    low = null
    lowB = null
    seg = null
    GLES20.glGenTextures(1, maskTexture, 0)
    configureTexture(maskTexture[0])
    GLES20.glGenTextures(1, pictureTexture, 0)
    configureTexture(pictureTexture[0])
    hasMaskTexture = false
    uploadedMaskFrame = -1L
    held.fill(null)
    heldFrame.fill(-1L)
    shownHeld = -1
    hasPictureTexture = false
    // A picture or mask from before a release goes up again on the next frame.
    pictureDirty = picture != null
  }

  private fun shader(name: String): String = assets.open("livestreamer/shaders/$name").bufferedReader().use { it.readText() }

  private fun configureTexture(id: Int) {
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, id)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, 0)
  }

  private fun target(current: Target?, width: Int, height: Int): Target {
    if (current != null && current.width == width && current.height == height) return current
    current?.let(::deleteTarget)
    val t = Target(width, height)
    GLES20.glGenTextures(1, t.texture, 0)
    configureTexture(t.texture[0])
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, t.texture[0])
    GLES20.glTexImage2D(GLES20.GL_TEXTURE_2D, 0, GLES20.GL_RGBA, width, height, 0, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, null)
    GLES20.glGenFramebuffers(1, t.fbo, 0)
    GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, t.fbo[0])
    GLES20.glFramebufferTexture2D(GLES20.GL_FRAMEBUFFER, GLES20.GL_COLOR_ATTACHMENT0, GLES20.GL_TEXTURE_2D, t.texture[0], 0)
    if (GLES20.glCheckFramebufferStatus(GLES20.GL_FRAMEBUFFER) != GLES20.GL_FRAMEBUFFER_COMPLETE) {
      Log.w(TAG, "framebuffer ${width}x$height incomplete")
    }
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, 0)
    return t
  }

  private fun deleteTarget(t: Target) {
    GLES20.glDeleteFramebuffers(1, t.fbo, 0)
    GLES20.glDeleteTextures(1, t.texture, 0)
  }

  // ---- per frame -----------------------------------------------------------------------

  override fun drawFilter() {
    val stage = stage ?: return
    val width = getWidth()
    val height = getHeight()
    val look = look
    // Without person detection, Blur would blur the seller too: show the plain camera instead.
    // (Picture without a mask already shows the whole camera: the seller is never hidden.)
    val mode = look.background.mode.let { if (it == BackgroundMode.BLUR && !segmenter.available) BackgroundMode.NONE else it }

    uploadPicture()
    if (mode.needsMask) uploadMask()
    // The camera frame the mask was found in, or the live one (no mask yet, or ML Kit stalled).
    val camera = if (mode.needsMask) heldCamera() else previousTexId

    if (mode == BackgroundMode.BLUR) blurRoom(look, width, height, camera)
    if (mode.needsMask) maybeSegment(look, width, height)

    // The stage pass, into this filter's own target (RootEncoder binds it before calling us,
    // but the passes above moved it).
    GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, getRenderHandler().getFboId()[0])
    GLES20.glViewport(0, 0, width, height)
    GLES20.glUseProgram(stage.id)
    attributes(stage, STMatrix)

    bindTexture(0, camera)
    bindTexture(1, low?.texture?.get(0) ?: camera)
    bindTexture(2, if (hasMaskTexture) maskTexture[0] else camera)
    bindTexture(3, if (hasPictureTexture) pictureTexture[0] else camera)
    GLES20.glUniform1i(stage.u("uSampler"), 0)
    GLES20.glUniform1i(stage.u("uBlur"), 1)
    GLES20.glUniform1i(stage.u("uMask"), 2)
    GLES20.glUniform1i(stage.u("uBackground"), 3)

    val bg = look.background
    GLES20.glUniform1f(stage.u("uMode"), mode.shaderValue)
    GLES20.glUniform1f(stage.u("uHasMask"), if (hasMaskTexture) 1f else 0f)
    GLES20.glUniform1f(stage.u("uHasBackground"), if (hasPictureTexture) 1f else 0f)
    GLES20.glUniform3f(stage.u("uTone"), Color.red(bg.tone) / 255f, Color.green(bg.tone) / 255f, Color.blue(bg.tone) / 255f)
    val cover = coverScale(pictureWidth, pictureHeight, width, height)
    GLES20.glUniform2f(stage.u("uBgScale"), cover[0], cover[1])
    val crop = crop
    GLES20.glUniform1f(stage.u("uZoom"), look.zoom)
    GLES20.glUniform1f(stage.u("uMirror"), if (look.mirror) 1f else 0f)
    GLES20.glUniform2f(stage.u("uCrop"), crop[0], crop[1])

    // Face enhance: about 5 px at 1080 px on the short side, like the website.
    val radius = max(2f, min(width, height) / 216f)
    GLES20.glUniform2f(stage.u("uStep"), radius / width, radius / height)
    GLES20.glUniform1f(stage.u("uBrightness"), look.brightness)
    GLES20.glUniform1f(stage.u("uContrast"), look.contrast)
    GLES20.glUniform1f(stage.u("uSaturation"), look.saturation)
    GLES20.glUniform1f(stage.u("uWarmth"), look.warmth)
    GLES20.glUniform1f(stage.u("uSmoothing"), look.smoothing)

    val f = look.filter
    GLES20.glUniform1f(stage.u("uFStrength"), f.strength)
    GLES20.glUniform3fv(stage.u("uFGain"), 1, f.gain, 0)
    GLES20.glUniform1f(stage.u("uFContrast"), f.contrast)
    GLES20.glUniform1f(stage.u("uFSaturation"), f.saturation)
    GLES20.glUniform1f(stage.u("uFFade"), f.fade)
    GLES20.glUniform3fv(stage.u("uFShadows"), 1, f.shadows, 0)
    GLES20.glUniform3fv(stage.u("uFHighlights"), 1, f.highlights, 0)
    GLES20.glUniform1f(stage.u("uFMono"), f.mono)
    GLES20.glUniform1f(stage.u("uFVignette"), f.vignette)
    GLES20.glUniform1f(stage.u("uFGrain"), f.grain)
    GLES20.glUniform1f(stage.u("uSeed"), (SystemClock.elapsedRealtime() / 1000f) % 100f)

    GLES20.glUniform3fv(stage.u("uKey"), 1, bg.key, 0)
    GLES20.glUniform1f(stage.u("uSimilarity"), bg.similarity)
    GLES20.glUniform1f(stage.u("uSmoothness"), bg.smoothness)

    // Leave unit 0 active: RootEncoder's clean-up unbinds the active unit's texture.
    GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
  }

  /** The held frame that matches the mask on screen; the live camera if none, or it's too old. */
  private fun heldCamera(): Int {
    val slot = shownHeld
    if (slot < 0 || !hasMaskTexture) return previousTexId
    val frame = held[slot] ?: return previousTexId
    // ML Kit stopped answering: keep the picture moving (with the last mask) rather than frozen.
    if (SystemClock.elapsedRealtime() - heldAt[slot] > MAX_HOLD_MS) return previousTexId
    return frame.texture[0]
  }

  /** The blurred room: the camera as drawn, at a quarter size, blurred across then down. */
  private fun blurRoom(look: LookSpec, width: Int, height: Int, camera: Int) {
    val view = view ?: return
    val blur = blur ?: return
    val lw = max(1, (width / 4f).roundToInt())
    val lh = max(1, (height / 4f).roundToInt())
    val a = target(low, lw, lh).also { low = it }
    val b = target(lowB, lw, lh).also { lowB = it }

    val crop = crop
    drawPass(view, a, camera, identity) {
      GLES20.glUniform1f(view.u("uZoom"), look.zoom)
      GLES20.glUniform1f(view.u("uMirror"), if (look.mirror) 1f else 0f)
      GLES20.glUniform2f(view.u("uCrop"), crop[0], crop[1])
      GLES20.glUniform2f(view.u("uSpread"), crop[0] / (4f * lw * look.zoom), crop[1] / (4f * lh * look.zoom))
    }
    // The website's blur: a standard deviation of width / 90 pixels (CSS blur()).
    val sigma = max(1f, width / 90f / 4f)
    drawPass(blur, b, a.texture[0], identity) { GLES20.glUniform2f(blur.u("uDir"), sigma / 2f / lw, 0f) }
    drawPass(blur, a, b.texture[0], identity) { GLES20.glUniform2f(blur.u("uDir"), 0f, sigma / 2f / lh) }
  }

  /**
   * Hands a small upright copy of the camera (as drawn) to ML Kit as soon as it's free, and
   * keeps the full frame (in the held slot not on screen) to draw once its mask is back.
   */
  private fun maybeSegment(look: LookSpec, width: Int, height: Int) {
    if (!segmenter.idle) return
    val view = view ?: return

    val slot = if (shownHeld == 0) 1 else 0
    val keep = target(held[slot], width, height).also { held[slot] = it }
    // An exact copy: no zoom, mirror or softening (the stage pass applies those).
    drawPass(view, keep, previousTexId, identity) {
      GLES20.glUniform1f(view.u("uZoom"), 1f)
      GLES20.glUniform1f(view.u("uMirror"), 0f)
      GLES20.glUniform2f(view.u("uCrop"), 1f, 1f)
      GLES20.glUniform2f(view.u("uSpread"), 0f, 0f)
    }
    val frameId = ++nextFrameId
    heldFrame[slot] = frameId
    heldAt[slot] = SystemClock.elapsedRealtime()

    val short = SEGMENT_SIZE.toFloat() / min(width, height)
    val sw = max(1, (width * short).roundToInt())
    val sh = max(1, (height * short).roundToInt())
    val t = target(seg, sw, sh).also { seg = it }
    val crop = crop
    drawPass(view, t, previousTexId, flipY) {
      GLES20.glUniform1f(view.u("uZoom"), look.zoom)
      GLES20.glUniform1f(view.u("uMirror"), if (look.mirror) 1f else 0f)
      GLES20.glUniform2f(view.u("uCrop"), crop[0], crop[1])
      GLES20.glUniform2f(view.u("uSpread"), crop[0] / (4f * sw * look.zoom), crop[1] / (4f * sh * look.zoom))
    }

    val bytes = sw * sh * 4
    val pixels = segPixels?.takeIf { it.capacity() == bytes } ?: ByteBuffer.allocateDirect(bytes).order(ByteOrder.nativeOrder()).also { segPixels = it }
    pixels.rewind()
    GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, t.fbo[0])
    GLES20.glReadPixels(0, 0, sw, sh, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, pixels)
    pixels.rewind()
    // One bitmap, reused: the segmenter is idle, so it isn't reading the previous one.
    val bitmap = segBitmap?.takeIf { it.width == sw && it.height == sh } ?: Bitmap.createBitmap(sw, sh, Bitmap.Config.ARGB_8888).also { segBitmap = it }
    bitmap.copyPixelsFromBuffer(pixels)
    segmenter.offer(bitmap, frameId)
  }

  private fun drawPass(program: Program, into: Target, source: Int, st: FloatArray, uniforms: () -> Unit) {
    GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, into.fbo[0])
    GLES20.glViewport(0, 0, into.width, into.height)
    GLES20.glUseProgram(program.id)
    attributes(program, st)
    bindTexture(0, source)
    GLES20.glUniform1i(program.u("uSampler"), 0)
    uniforms()
    GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
    GlUtil.disableResources(program.textureCoord, program.position)
  }

  private fun attributes(program: Program, st: FloatArray) {
    squareVertex.position(SQUARE_VERTEX_DATA_POS_OFFSET)
    GLES20.glVertexAttribPointer(program.position, 3, GLES20.GL_FLOAT, false, SQUARE_VERTEX_DATA_STRIDE_BYTES, squareVertex)
    GLES20.glEnableVertexAttribArray(program.position)
    squareVertex.position(SQUARE_VERTEX_DATA_UV_OFFSET)
    GLES20.glVertexAttribPointer(program.textureCoord, 2, GLES20.GL_FLOAT, false, SQUARE_VERTEX_DATA_STRIDE_BYTES, squareVertex)
    GLES20.glEnableVertexAttribArray(program.textureCoord)
    GLES20.glUniformMatrix4fv(program.mvp, 1, false, MVPMatrix, 0)
    GLES20.glUniformMatrix4fv(program.st, 1, false, st, 0)
  }

  private fun bindTexture(unit: Int, id: Int) {
    GLES20.glActiveTexture(GLES20.GL_TEXTURE0 + unit)
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, id)
  }

  private fun uploadPicture() {
    val pending = pendingPicture.getAndSet(null)
    if (pending != null) {
      picture = pending
      pictureDirty = true
    }
    if (!pictureDirty) return
    pictureDirty = false
    val bitmap = picture?.bitmap
    if (bitmap == null || bitmap.isRecycled) {
      hasPictureTexture = false
      return
    }
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, pictureTexture[0])
    GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, bitmap, 0)
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, 0)
    pictureWidth = bitmap.width
    pictureHeight = bitmap.height
    hasPictureTexture = true
  }

  /** A new mask goes up with its held frame; one whose frame is no longer held is dropped. */
  private fun uploadMask() {
    val mask = segmenter.latest ?: return
    if (mask.frameId == uploadedMaskFrame) return
    uploadedMaskFrame = mask.frameId
    val slot = heldFrame.indexOf(mask.frameId)
    if (slot < 0) return
    shownHeld = slot
    GLES20.glPixelStorei(GLES20.GL_UNPACK_ALIGNMENT, 1)
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, maskTexture[0])
    GLES20.glTexImage2D(GLES20.GL_TEXTURE_2D, 0, GLES20.GL_LUMINANCE, mask.width, mask.height, 0, GLES20.GL_LUMINANCE, GLES20.GL_UNSIGNED_BYTE, ByteBuffer.wrap(mask.bytes))
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, 0)
    GLES20.glPixelStorei(GLES20.GL_UNPACK_ALIGNMENT, 4)
    hasMaskTexture = true
  }

  override fun disableResources() {
    val stage = stage ?: return
    GlUtil.disableResources(stage.textureCoord, stage.position)
  }

  override fun release() {
    stage?.let { GLES20.glDeleteProgram(it.id) }
    view?.let { GLES20.glDeleteProgram(it.id) }
    blur?.let { GLES20.glDeleteProgram(it.id) }
    stage = null
    view = null
    blur = null
    (listOfNotNull(low, lowB, seg) + held.filterNotNull()).forEach(::deleteTarget)
    low = null
    lowB = null
    seg = null
    held.fill(null)
    heldFrame.fill(-1L)
    shownHeld = -1
    GLES20.glDeleteTextures(1, maskTexture, 0)
    GLES20.glDeleteTextures(1, pictureTexture, 0)
    hasMaskTexture = false
    hasPictureTexture = false
  }

  companion object {
    private const val TAG = "LiveStreamer"
    /** The short side of the frames handed to ML Kit (its model works at 256×256). */
    private const val SEGMENT_SIZE = 256
    /** A held frame older than this (ML Kit stalled) gives way to the live camera. */
    private const val MAX_HOLD_MS = 300L

    /** The part of a picture that fills the stage without stretching ("cover"), as a uv scale. */
    fun coverScale(pictureWidth: Int, pictureHeight: Int, stageWidth: Int, stageHeight: Int): FloatArray {
      if (pictureWidth <= 0 || pictureHeight <= 0 || stageWidth <= 0 || stageHeight <= 0) return floatArrayOf(1f, 1f)
      val target = stageWidth.toFloat() / stageHeight
      val image = pictureWidth.toFloat() / pictureHeight
      return floatArrayOf(min(1f, target / image), min(1f, image / target))
    }
  }
}
