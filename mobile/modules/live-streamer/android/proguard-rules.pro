# RootEncoder loads codecs, sources and GL filters partly by class; keep it whole when the
# release build shrinks code (enableMinifyInReleaseBuilds in app.config.ts).
-keep class com.pedro.** { *; }
-dontwarn com.pedro.**

# ML Kit's selfie segmentation (PersonSegmenter) runs MediaPipe in native code (libxeno_native.so),
# which finds these Java classes by name. Shrinking renamed or removed them, so in release builds
# every frame failed and the Blur and Picture backgrounds never showed ("can't pick you out").
-keep class com.google.mlkit.vision.mediapipe.** { *; }
-keep class com.google.android.gms.internal.mlkit_vision_mediapipe.** { *; }
