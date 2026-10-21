import { requireNativeViewManager } from 'expo-modules-core'
import type { ComponentType, Ref } from 'react'

import type { LiveStreamerHandle, LiveStreamerProps } from './LiveStreamer.types'

/**
 * The camera preview that is also the live picture. Mount it full screen behind the
 * controls; drive it through a ref (startStream, setOverlay, playSound…).
 *
 * Android only, and only in a development or release build of this app (not Expo Go),
 * because it carries native code (modules/live-streamer/android).
 */
export const LiveStreamerView = requireNativeViewManager('LiveStreamer') as ComponentType<
  LiveStreamerProps & { ref?: Ref<LiveStreamerHandle> }
>
