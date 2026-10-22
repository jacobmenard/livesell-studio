import type { ConfigContext, ExpoConfig } from 'expo/config'

/**
 * NegosyoWork Studio for Android. Distributed as a signed APK from the NegosyoWork website
 * (not Google Play), so there is no iOS build and no push notifications.
 *
 * Environment (see .env.example):
 *  - EXPO_PUBLIC_API_URL: the Laravel API, e.g. https://studio.negosyowork.ph
 *  - APP_ENV=production: release builds refuse plain http:// traffic.
 */
const isProduction = process.env.APP_ENV === 'production'

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'NegosyoWork Studio',
  slug: 'negosyowork-studio',
  scheme: 'negosyowork',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  backgroundColor: '#000000',
  icon: './assets/icon.png',
  platforms: ['android'],
  android: {
    package: 'ph.negosyowork.studio',
    // Bump on every APK you publish; the app compares it with GET /api/mobile/version.
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: '#062B63',
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: ['android.permission.CAMERA', 'android.permission.RECORD_AUDIO', 'android.permission.MODIFY_AUDIO_SETTINGS'],
    blockedPermissions: [
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ],
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    // Release APKs are signed with your own upload key, never the public debug key (see README).
    './plugins/withReleaseSigning',
    [
      'expo-font',
      { fonts: ['./assets/fonts/BricolageGrotesque-ExtraBold.ttf'] },
    ],
    [
      'expo-splash-screen',
      { image: './assets/splash-icon.png', imageWidth: 160, backgroundColor: '#000000', resizeMode: 'contain' },
    ],
    [
      'expo-build-properties',
      {
        android: {
          // RootEncoder (the RTMP streaming library in modules/live-streamer) is published on JitPack.
          extraMavenRepos: ['https://jitpack.io'],
          minSdkVersion: 26,
          // Development builds talk to a local Laravel over http://; release builds need https.
          usesCleartextTraffic: !isProduction,
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
        },
      },
    ],
  ],
  experiments: { typedRoutes: true },
})
