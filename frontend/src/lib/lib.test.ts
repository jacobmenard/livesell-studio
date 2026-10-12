import { describe, expect, it } from 'vitest'
import { editedLabel, formatDate, formatPrice, initials, plural } from './format'
import { checkEmail, checkPassword, checkRtmpServer, checkStreamKey, compact, withoutKey } from './validation'

describe('validation', () => {
  it('checks email and password like the API', () => {
    expect(checkEmail('')).toBe('Enter your email.')
    expect(checkEmail('nope')).toMatch(/valid email/)
    expect(checkEmail('seller@shop.ph')).toBeUndefined()
    expect(checkPassword('short')).toMatch(/8 characters/)
    expect(checkPassword('long-enough')).toBeUndefined()
  })

  it('checks stream server and key', () => {
    expect(checkRtmpServer('https://x.com/live')).toMatch(/rtmp/)
    expect(checkRtmpServer('rtmps://live-api-s.facebook.com:443/rtmp/')).toBeUndefined()
    expect(checkStreamKey('has space')).toMatch(/no spaces/)
    expect(checkStreamKey('FB-123')).toBeUndefined()
  })

  it('compacts and removes errors', () => {
    expect(compact({ a: undefined, b: 'x' })).toEqual({ b: 'x' })
    expect(withoutKey({ a: '1', b: '2' }, 'a')).toEqual({ b: '2' })
  })
})

describe('format', () => {
  const now = new Date(2026, 9, 2, 20, 0)

  it('describes when a setup was edited', () => {
    expect(editedLabel(new Date(2026, 9, 2, 19, 40).toISOString(), now)).toMatch(/^Edited today, 7:40\sPM$/)
    expect(editedLabel(new Date(2026, 9, 1, 12, 5).toISOString(), now)).toBe('Edited yesterday')
    expect(editedLabel(new Date(2026, 8, 28).toISOString(), now)).toBe('Edited Sep 28')
    expect(editedLabel(null, now)).toBe('Not edited yet')
  })

  it('pluralises and makes initials', () => {
    expect(plural(1, 'popup')).toBe('1 popup')
    expect(plural(2, 'popup')).toBe('2 popups')
    expect(initials('Menard Catayas')).toBe('MC')
    expect(initials('shop')).toBe('SH')
  })
})

describe('plan prices', () => {
  it('shows whole pesos with the peso sign', () => {
    expect(formatPrice(999, 'PHP')).toBe('₱999')
    expect(formatPrice(1999, 'PHP')).toBe('₱1,999')
  })

  it('shows dates plainly and nothing for no date', () => {
    expect(formatDate(null)).toBe('')
    expect(formatDate('not a date')).toBe('')
    expect(formatDate('2026-10-31T12:00:00+08:00')).toContain('2026')
  })
})
