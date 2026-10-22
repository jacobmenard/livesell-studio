import type { MediaItem } from '@/api/types'
import { absoluteUrl, API_URL } from '@/config'
import { checkPicked, MAX_UPLOAD_BYTES } from '@/media/pickImage'
import { backgroundOf, foregroundOf, nearestLevel, previewBackground, SIMILARITY_LEVELS, SMOOTHNESS_LEVELS } from './background'

function item(id: number, kind: MediaItem['kind'], url = `/storage/media/1/${id}.png`): MediaItem {
  return { id, kind, label: `Pic ${id}`, url, mime: 'image/png', size: 1, width: 100, height: 50, created_at: null }
}

describe('background settings', () => {
  it('fills in what older setups are missing and rejects unknown values', () => {
    expect(backgroundOf({})).toEqual({ mode: 'image', preset: 'rack', media_id: null, key_color: 'green', similarity: 42, smoothness: 18 })
    expect(backgroundOf({ mode: 'party', preset: 'beach', key_color: 'red', similarity: 140, smoothness: -3 })).toEqual(
      expect.objectContaining({ mode: 'image', preset: 'rack', key_color: 'green', similarity: 100, smoothness: 0 }),
    )
    expect(backgroundOf({ mode: 'green', preset: 'white', media_id: 4 })).toEqual(expect.objectContaining({ mode: 'green', preset: 'white', media_id: 4 }))
  })

  it('reads a foreground as off until it has a picture', () => {
    expect(foregroundOf(undefined)).toEqual({ enabled: false, media_id: null, dock: 'bottom' })
    expect(foregroundOf({ enabled: true, media_id: null, dock: 'top' })).toEqual({ enabled: false, media_id: null, dock: 'top' })
    expect(foregroundOf({ enabled: true, media_id: 3, dock: 'sideways' })).toEqual({ enabled: true, media_id: 3, dock: 'bottom' })
  })

  it('shows a value set with the web slider as its nearest step', () => {
    expect(nearestLevel(SIMILARITY_LEVELS, 42)).toBe('42')
    expect(nearestLevel(SIMILARITY_LEVELS, 90)).toBe('60')
    expect(nearestLevel(SMOOTHNESS_LEVELS, 0)).toBe('8')
  })

  it('previews an own photo, falls back to the preset when it is gone, and shows the room in None/Blur', () => {
    const settings = backgroundOf({ mode: 'image', preset: 'loft', media_id: 9 })
    expect(previewBackground(settings, [item(9, 'background')]).imageUrl).toBe(`${API_URL}/storage/media/1/9.png`)
    // A photo of another kind, or one that was deleted, isn't used.
    expect(previewBackground(settings, [item(9, 'foreground')])).toEqual({ imageUrl: null, tone: '#3A3424' })
    expect(previewBackground({ ...settings, mode: 'blur' }, [item(9, 'background')]).imageUrl).toBeNull()
  })
})

describe('picture addresses', () => {
  it('turns server paths into full addresses and keeps full ones', () => {
    expect(absoluteUrl('/storage/a.png')).toBe(`${API_URL}/storage/a.png`)
    expect(absoluteUrl('https://cdn.test/a.png')).toBe('https://cdn.test/a.png')
    expect(absoluteUrl(null)).toBeNull()
    expect(absoluteUrl('javascript:alert(1)')).toBeNull()
  })
})

describe('picking a picture to upload', () => {
  it('accepts the server’s picture types and keeps the original file', () => {
    expect(checkPicked({ uri: 'file:///a.gif', mimeType: 'image/gif', fileName: 'party.gif', fileSize: 1000 })).toEqual({
      kind: 'picked',
      file: { uri: 'file:///a.gif', name: 'party.gif', type: 'image/gif' },
    })
    expect(checkPicked({ uri: 'file:///b', mimeType: 'image/png' })).toEqual(expect.objectContaining({ file: expect.objectContaining({ name: 'picture.png' }) }))
  })

  it('refuses other types and files over 5 MB', () => {
    expect(checkPicked({ uri: 'file:///c.heic', mimeType: 'image/heic' }).kind).toBe('invalid')
    expect(checkPicked({ uri: 'file:///d.png', mimeType: 'image/png', fileSize: MAX_UPLOAD_BYTES + 1 }).kind).toBe('invalid')
  })
})
