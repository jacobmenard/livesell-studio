import { describe, expect, it } from 'vitest'
import { isStaleBuildError } from './staleBuild'

describe('isStaleBuildError', () => {
  it('recognises a page file that a newer deploy removed, in every browser', () => {
    expect(isStaleBuildError(new TypeError('Failed to fetch dynamically imported module: https://app.example.com/assets/AdminPage-SU3HR42u.js'))).toBe(true)
    expect(isStaleBuildError(new TypeError('error loading dynamically imported module: https://app.example.com/assets/x.js'))).toBe(true)
    expect(isStaleBuildError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isStaleBuildError(new Error('Unable to preload CSS for /assets/EditorPage-abc.css'))).toBe(true)
  })

  it('leaves other errors alone', () => {
    expect(isStaleBuildError(new TypeError("Cannot read properties of undefined (reading 'name')"))).toBe(false)
    expect(isStaleBuildError(new Error('Request failed with status code 500'))).toBe(false)
    expect(isStaleBuildError(null)).toBe(false)
  })
})
