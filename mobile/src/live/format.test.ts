import { clock, duration, failureMessage, signal } from './format'

describe('live formatting', () => {
  it('shows the live timer', () => {
    expect(clock(0)).toBe('0:00')
    expect(clock(754)).toBe('12:34')
    expect(clock(3754)).toBe('1:02:34')
  })

  it('shows how long a live was', () => {
    expect(duration(42)).toBe('42s')
    expect(duration(300)).toBe('5m')
    expect(duration(5040)).toBe('1h 24m')
  })

  it('turns status and congestion into a signal chip', () => {
    expect(signal('live', 10)).toEqual({ label: 'Good signal', tone: 'good' })
    expect(signal('live', 70).tone).toBe('weak')
    expect(signal('reconnecting', 0).tone).toBe('lost')
  })

  it('explains a rejected key and a network failure differently', () => {
    expect(failureMessage('auth', 'Facebook')).toMatch(/refused the stream key/)
    expect(failureMessage('Connection timeout', 'YouTube')).toMatch(/couldn't reach YouTube/)
    expect(failureMessage(null, 'TikTok')).toMatch(/stopped/)
  })
})
