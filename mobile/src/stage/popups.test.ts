import { checkPopupText, newPopupKey, newTextPopup, removePopup, updatePopup } from './popups'

describe('custom popups', () => {
  it('makes keys the API accepts', () => {
    const key = newPopupKey('txt', 1_760_000_000_000, 0.5)
    expect(key).toMatch(/^[a-z0-9][a-z0-9-]{0,39}$/)
    expect(key.startsWith('txt-')).toBe(true)
  })

  it('checks popup text like the website', () => {
    expect(checkPopupText('   ')).toMatch(/Type the words/)
    expect(checkPopupText('X'.repeat(25))).toMatch(/24 characters/)
    expect(checkPopupText('MINE\u0007')).toMatch(/letters, numbers/)
    expect(checkPopupText('₱99 ONLY')).toBeUndefined()
  })

  it('creates a centred text popup in the chosen colour', () => {
    const p = newTextPopup('  MINE NA!  ', 'coral', 'txt-abc')
    expect(p).toMatchObject({ key: 'txt-abc', kind: 'text', text: 'MINE NA!', label: 'MINE NA!', color: 'coral', position: 'mc', size: 100 })
  })

  it('updates one popup and never removes built-ins', () => {
    const preset = { ...newTextPopup('A', 'yellow', 'off10'), kind: 'preset' as const, preset_key: 'off10' as const }
    const custom = newTextPopup('B', 'blue', 'txt-b')
    const list = updatePopup([preset, custom], 'txt-b', { size: 140 })
    expect(list[1]?.size).toBe(140)
    expect(list[0]?.size).toBe(100)
    expect(removePopup(list, 'off10')).toHaveLength(2)
    expect(removePopup(list, 'txt-b').map((p) => p.key)).toEqual(['off10'])
  })
})
