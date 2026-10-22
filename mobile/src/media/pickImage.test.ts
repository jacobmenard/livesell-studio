import { MAX_UPLOAD_BYTES, prepareUpload } from './pickImage'

jest.mock('expo-image-picker', () => ({}))

describe('preparing a picture for upload', () => {
  it('keeps the type and names the file with its extension', () => {
    expect(prepareUpload('background', { uri: 'file:///x/IMG_0012.JPG', fileName: 'IMG_0012.JPG', mimeType: 'image/jpeg', fileSize: 1000 })).toEqual({
      file: { uri: 'file:///x/IMG_0012.JPG', name: 'IMG_0012.jpg', type: 'image/jpeg' },
    })
  })

  it('guesses the type from the name when the picker gives none', () => {
    const r = prepareUpload('foreground', { uri: 'file:///x/banner.png', fileName: null, mimeType: null })
    expect(r).toMatchObject({ file: { type: 'image/png', name: 'banner.png' } })
  })

  it('refuses videos and other files', () => {
    expect(prepareUpload('background', { uri: 'file:///x/clip.mp4', mimeType: 'video/mp4' })).toEqual({ error: expect.stringMatching(/not supported/) })
    expect(prepareUpload('background', { uri: 'file:///x/doc.heic', mimeType: 'image/heic' })).toEqual({ error: expect.stringMatching(/PNG, JPG/) })
  })

  it('refuses pictures over 5 MB', () => {
    expect(prepareUpload('background', { uri: 'file:///x/big.jpg', mimeType: 'image/jpeg', fileSize: MAX_UPLOAD_BYTES + 1 })).toEqual({ error: expect.stringMatching(/5 MB/) })
  })

  it('cleans odd file names and fills in a missing one', () => {
    const odd = prepareUpload('background', { uri: 'content://media/1', fileName: '../../My shop!!.webp', mimeType: 'image/webp' })
    expect(odd).toMatchObject({ file: { name: 'My shop.webp' } })
    const none = prepareUpload('foreground', { uri: 'content://media/2', mimeType: 'image/gif' })
    expect(none).toMatchObject({ file: { name: expect.stringMatching(/^foreground-\d+\.gif$/) } })
  })
})
