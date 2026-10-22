import { Dimensions } from 'react-native'
import * as ScreenOrientation from 'expo-screen-orientation'

import { isTabletScreen } from './device'

/**
 * Phones stay upright (their screens are designed for it); tablets turn either way, since
 * a seller stands the tablet the way the live is shaped. Uses the whole screen, not the app's
 * window, so a split-screen window on a tablet doesn't change it.
 */
export async function applyOrientationPolicy(): Promise<void> {
  const screen = Dimensions.get('screen')
  try {
    if (isTabletScreen(screen)) await ScreenOrientation.unlockAsync()
    else await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
  } catch {
    // Not fatal: the app still works in whatever orientation the system gives it.
  }
}
