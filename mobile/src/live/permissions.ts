import { Linking, PermissionsAndroid } from 'react-native'

export type PermissionState = 'granted' | 'denied' | 'blocked' | 'unknown'

const CAMERA = PermissionsAndroid.PERMISSIONS.CAMERA
const MIC = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO

export async function checkPermissions(): Promise<{ camera: PermissionState; mic: PermissionState }> {
  const [camera, mic] = await Promise.all([PermissionsAndroid.check(CAMERA), PermissionsAndroid.check(MIC)])
  return { camera: camera ? 'granted' : 'unknown', mic: mic ? 'granted' : 'unknown' }
}

/** Asks for the camera and microphone together. "blocked" = the seller chose "Don't ask again". */
export async function requestPermissions(): Promise<{ camera: PermissionState; mic: PermissionState }> {
  const result = await PermissionsAndroid.requestMultiple([CAMERA, MIC])
  const map = (r: string | undefined): PermissionState =>
    r === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'blocked' : 'denied'
  return { camera: map(result[CAMERA]), mic: map(result[MIC]) }
}

/** Just the camera, for the editor's preview (the microphone is only needed to go live). */
export async function requestCamera(): Promise<PermissionState> {
  const r = await PermissionsAndroid.request(CAMERA)
  return r === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'blocked' : 'denied'
}

export function openAppSettings(): void {
  void Linking.openSettings()
}
