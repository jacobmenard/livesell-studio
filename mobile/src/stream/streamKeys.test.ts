import { checkKey, checkServer, keyHint, streamUrl } from './streamKeys'

jest.mock('expo-secure-store', () => ({}))

describe('stream keys', () => {
  it('joins server and key with one slash', () => {
    expect(streamUrl({ server: 'rtmps://live-api-s.facebook.com:443/rtmp/', key: 'FB-123' })).toBe(
      'rtmps://live-api-s.facebook.com:443/rtmp/FB-123',
    )
    expect(streamUrl({ server: 'rtmp://a.rtmp.youtube.com/live2', key: ' abc ' })).toBe('rtmp://a.rtmp.youtube.com/live2/abc')
  })

  it('accepts rtmp and rtmps servers only', () => {
    expect(checkServer('rtmps://live-api-s.facebook.com:443/rtmp/')).toBeUndefined()
    expect(checkServer('rtmp://push.example.com/live')).toBeUndefined()
    expect(checkServer('https://facebook.com')).toMatch(/rtmp/)
    expect(checkServer('')).toMatch(/Paste/)
  })

  it('catches keys pasted with spaces', () => {
    expect(checkKey('abc def')).toMatch(/no spaces/)
    expect(checkKey('')).toMatch(/Paste/)
    expect(checkKey('FB-1234-ABCD')).toBeUndefined()
  })

  it('shows only the last 4 characters', () => {
    expect(keyHint('FB-1234567890-ABCDEFG7Q2F')).toBe('7Q2F')
    expect(keyHint('ab')).toBe('••••')
  })
})
