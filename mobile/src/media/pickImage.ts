import * as ImagePicker from 'expo-image-picker'

import type { UploadFile } from '@/api/endpoints'

// Same rules as the server (backend MediaStorage) for "background" and "foreground" uploads;
// the server checks the real file content again.
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export type PickResult = { kind: 'picked'; file: UploadFile } | { kind: 'cancelled' } | { kind: 'invalid'; message: string }

interface PickedAsset {
  uri: string
  mimeType?: string | null
  fileName?: string | null
  fileSize?: number | null
}

/** Checks a picked picture before uploading it, so the seller gets a clear message at once. */
export function checkPicked(asset: PickedAsset): PickResult {
  const type = (asset.mimeType ?? '').toLowerCase()
  const ext = TYPES[type]
  if (!ext) return { kind: 'invalid', message: 'Use a PNG, JPG, WEBP or GIF picture.' }
  if (asset.fileSize && asset.fileSize > MAX_UPLOAD_BYTES) return { kind: 'invalid', message: 'The picture must be 5 MB or smaller.' }
  const name = asset.fileName?.trim() || `picture.${ext}`
  return { kind: 'picked', file: { uri: asset.uri, name, type } }
}

/**
 * Opens the phone's gallery for one picture. The original file is sent as it is (no cropping
 * or re-compressing), so PNG transparency and moving GIFs survive.
 */
export async function pickImage(): Promise<PickResult> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 })
  if (result.canceled || !result.assets[0]) return { kind: 'cancelled' }
  return checkPicked(result.assets[0])
}
