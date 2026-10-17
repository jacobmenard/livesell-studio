import { useCallback, useEffect, useState } from 'react'
import { errorMessage } from '../lib/api'
import { mediaApi } from '../lib/endpoints'
import type { MediaItem, MediaKind } from '../lib/types'
import { MAX_UPLOAD_BYTES } from '../stage/catalog'

const TYPES: Record<MediaKind, { mimes: string[]; label: string }> = {
  image: { mimes: ['image/png', 'image/webp', 'image/gif', 'image/jpeg'], label: 'PNG, WEBP, GIF or JPG' },
  background: { mimes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], label: 'PNG, JPG, WEBP or GIF' },
  foreground: { mimes: ['image/png', 'image/webp', 'image/gif', 'image/jpeg'], label: 'PNG, WEBP, GIF or JPG' },
  sound: { mimes: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/aac'], label: 'MP3, WAV, OGG or M4A' },
}

export const ACCEPT: Record<MediaKind, string> = {
  image: TYPES.image.mimes.join(','),
  background: TYPES.background.mimes.join(','),
  foreground: TYPES.foreground.mimes.join(','),
  sound: [...TYPES.sound.mimes, '.mp3', '.wav', '.ogg', '.m4a', '.aac'].join(','),
}

/** Quick check before uploading (the server checks the real file content again). */
export function checkUpload(kind: MediaKind, file: File): string | undefined {
  const typeOk = TYPES[kind].mimes.includes(file.type) || (kind === 'sound' && /\.(mp3|wav|ogg|m4a|aac)$/i.test(file.name))
  if (!typeOk) return `That file type is not supported. Use ${TYPES[kind].label}.`
  if (file.size > MAX_UPLOAD_BYTES) return 'File is too big. Keep it at 5 MB or less.'
  return undefined
}

/** The seller's uploaded popup images, backgrounds and sounds. */
export function useMediaLibrary() {
  const [items, setItems] = useState<MediaItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState<MediaKind | null>(null)

  useEffect(() => {
    let cancelled = false
    mediaApi
      .list()
      .then((list) => !cancelled && setItems(list))
      .catch((e) => !cancelled && setError(errorMessage(e, "We couldn't load your uploads.")))
      .finally(() => !cancelled && setLoaded(true))
    return () => {
      cancelled = true
    }
  }, [])

  /** Uploads a file; resolves the new item, or throws an Error with a message for the seller. */
  const upload = useCallback(async (kind: MediaKind, file: File): Promise<MediaItem> => {
    const problem = checkUpload(kind, file)
    if (problem) throw new Error(problem)
    setUploading(kind)
    try {
      const item = await mediaApi.upload(kind, file)
      setItems((prev) => [...prev, item])
      return item
    } catch (e) {
      throw new Error(errorMessage(e, 'That file could not be uploaded.'), { cause: e })
    } finally {
      setUploading(null)
    }
  }, [])

  const remove = useCallback(async (id: number) => {
    await mediaApi.remove(id)
    setItems((prev) => prev.filter((m) => m.id !== id))
  }, [])

  return { items, loaded, error, uploading, upload, remove }
}
