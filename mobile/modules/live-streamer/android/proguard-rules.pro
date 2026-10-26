# RootEncoder loads codecs, sources and GL filters partly by class; keep it whole when the
# release build shrinks code (enableMinifyInReleaseBuilds in app.config.ts).
-keep class com.pedro.** { *; }
-dontwarn com.pedro.**

# ML Kit's selfie segmentation (PersonSegmenter) runs MediaPipe in native code (libxeno_native.so),
# which finds Java classes by name; shrinking renamed or removed them, so in release builds every
# frame failed and the Blur and Picture backgrounds never showed ("can't pick you out"). ML Kit is
# kept whole: it is small, its beta packages ship no keep rules of their own, and its exception
# names then stay readable in the warning's details.
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.internal.mlkit_** { *; }
-keep class com.google.research.xeno.** { *; }
