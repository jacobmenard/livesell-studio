import * as ImagePicker from 'expo-image-picker'

import type { PickedFile } from '@/api/endpoints'
import type { MediaKind } from '@/api/types'

/** Same limit as the API (MAX_UPLOAD_BYTES on the website). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

const TYPES: Record<'background' | 'foreground' | 'image', { mimes: string[]; label: string }> = {
  background: { mimes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], label: 'PNG, JPG, WEBP or GIF' },
  foreground: { mimes: ['image/png', 'image/webp', 'image/gif', 'image/jpeg'], label: 'PNG, WEBP, GIF or JPG' },
  image: { mimes: ['image/png', 'image/webp', 'image/gif', 'image/jpeg'], label: 'PNG, WEBP, GIF or JPG' },
}

const EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }

export interface PickerAsset {
  uri: string
  fileName?: string | null
  mimeType?: string | null
  fileSize?: number | null
}

/**
 * Checks a picked picture before uploading (the server checks the real content again), and
 * gives it a file name with the right extension (the API checks extensions too).
 */
export function prepareUpload(kind: Exclude<MediaKind, 'sound'>, asset: PickerAsset): { file: PickedFile } | { error: string } {
  const type = (asset.mimeType ?? guessMime(asset.fileName ?? asset.uri)).toLowerCase()
  if (!TYPES[kind].mimes.includes(type)) return { error: `That file type is not supported. Use ${TYPES[kind].label}.` }
  if (asset.fileSize && asset.fileSize > MAX_UPLOAD_BYTES) return { error: 'That picture is too big. Keep it at 5 MB or less.' }
  const ext = EXTENSIONS[type] ?? 'jpg'
  const fromPath = asset.uri.startsWith('file://') ? (asset.uri.split('/').pop() ?? '') : ''
  const base = (asset.fileName ?? fromPath).replace(/\.[^.]*$/, '').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || `${kind}-${Date.now()}`
  return { file: { uri: asset.uri, name: `${base}.${ext}`, type } }
}

function guessMime(name: string): string {
  const ext = /\.([a-z0-9]+)(?:\?.*)?$/i.exec(name)?.[1]?.toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return ''
}

/** Opens the phone's photo picker (no permission needed: Android's own picker). Null if cancelled. */
export async function pickPicture(): Promise<PickerAsset | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: false, exif: false })
  if (result.canceled) return null
  return result.assets[0] ?? null
}
