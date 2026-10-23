package expo.modules.livestreamer

/**
 * How the camera picture is turned and cropped so the live is upright and never stretched.
 *
 * Android's preview transform already turns the camera image upright for the device's natural
 * orientation (portrait on phones, landscape on most tablets); turning for how the device is
 * held is left to the app (developer.android.com/media/camera/camera2/camera-preview). RootEncoder
 * does that from the screen rotation, but assumes rotation 0 is portrait, which is only true on
 * phones. So:
 *  - phones (the app stays upright): the device is taken to be held the way the live is shaped,
 *    exactly as before;
 *  - tablets (the app turns with the device): the screen's real rotation is used, and when the
 *    tablet is held across the live's shape the middle of the picture fills the live.
 * Plain Kotlin, so it runs in JVM tests.
 */
object CameraFraming {

  /** Degrees the device is turned from its natural orientation. */
  fun deviceRotation(followScreen: Boolean, screenRotation: Int, landscapeLive: Boolean): Int =
    if (followScreen) normalize(screenRotation) else if (landscapeLive) 90 else 0

  /** RootEncoder's camera rotation: the same values its CameraHelper gives on phones. */
  fun cameraRotation(deviceRotation: Int): Int = (360 - normalize(deviceRotation)) % 360

  /** Whether the device's natural orientation is portrait, from the screen's rotation and shape now. */
  fun naturalPortrait(screenRotation: Int, screenIsPortrait: Boolean): Boolean =
    if (normalize(screenRotation) % 180 == 0) screenIsPortrait else !screenIsPortrait

  /**
   * The scale of the camera's texture coordinates (x, y) that keeps the picture's real shape in
   * the live: 1 = all of it; less = the middle part. [long] × [short] is the camera's shape.
   */
  fun crop(naturalPortrait: Boolean, cameraRotation: Int, landscapeLive: Boolean, long: Int, short: Int): FloatArray {
    if (long <= 0 || short <= 0) return floatArrayOf(1f, 1f)
    val turned = normalize(cameraRotation) % 180 != 0
    val framePortrait = naturalPortrait != turned
    val frame = if (framePortrait) short.toFloat() / long else long.toFloat() / short
    val live = if (landscapeLive) long.toFloat() / short else short.toFloat() / long
    return if (frame > live) floatArrayOf(live / frame, 1f) else floatArrayOf(1f, frame / live)
  }

  private fun normalize(degrees: Int) = ((degrees % 360) + 360) % 360
}
