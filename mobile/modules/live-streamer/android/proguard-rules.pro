# RootEncoder loads codecs, sources and GL filters partly by class; keep it whole when the
# release build shrinks code (enableMinifyInReleaseBuilds in app.config.ts).
-keep class com.pedro.** { *; }
-dontwarn com.pedro.**
