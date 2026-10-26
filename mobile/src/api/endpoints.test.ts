import { convertFormDataAsync } from 'expo/src/winter/fetch/convertFormData'

import { uploadPart } from './endpoints'

jest.mock('expo-application', () => ({ nativeBuildVersion: '1', nativeApplicationVersion: '1.0.0' }))

const mockFileBytes = jest.fn()
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({ bytes: () => mockFileBytes(uri) })),
}))

/** What Expo's patched FormData hands expo/fetch: the parts exactly as appended. */
function form(parts: [string, unknown][]): FormData {
  return { entries: () => parts } as unknown as FormData
}

function includesBytes(haystack: Uint8Array, needle: number[]): boolean {
  return haystack.some((_, i) => needle.every((byte, j) => haystack[i + j] === byte))
}

const picked = { uri: 'file:///cache/ImagePicker/shop.jpg', name: 'shop.jpg', type: 'image/jpeg' }

describe('picture uploads', () => {
  it('sends the picture through expo/fetch with its name, type and bytes', async () => {
    mockFileBytes.mockResolvedValue(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))
    const { body } = await convertFormDataAsync(form([['kind', 'background'], ['file', uploadPart(picked)]]), 'B')
    const text = new TextDecoder().decode(body)
    expect(text).toContain('content-disposition: form-data; name="file"; filename="shop.jpg"')
    expect(text).toContain('content-type: image/jpeg')
    expect(includesBytes(body, [0xff, 0xd8, 0xff, 0xe0])).toBe(true)
    expect(mockFileBytes).toHaveBeenCalledWith(picked.uri)
  })

  it("can't send React Native's { uri } part, the cause of the failed uploads", async () => {
    await expect(convertFormDataAsync(form([['file', picked]]), 'B')).rejects.toThrow('Unsupported FormDataPart implementation')
  })
})
