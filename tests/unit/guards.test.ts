import { describe, expect, it } from 'vitest'
import { isRecentLogin } from '../../functions/src/guards'

const now = Date.UTC(2026, 9, 15, 12, 0, 0)
const secondsAgo = (s: number) => now / 1000 - s

describe('isRecentLogin (needed before an account can be deleted)', () => {
  it('accepts a sign-in from the last 5 minutes', () => {
    expect(isRecentLogin(secondsAgo(10), now)).toBe(true)
    expect(isRecentLogin(secondsAgo(299), now)).toBe(true)
  })

  it('refuses an older sign-in, a missing time and the wrong type', () => {
    expect(isRecentLogin(secondsAgo(301), now)).toBe(false)
    expect(isRecentLogin(secondsAgo(86400), now)).toBe(false)
    expect(isRecentLogin(undefined, now)).toBe(false)
    expect(isRecentLogin('now', now)).toBe(false)
    expect(isRecentLogin(null, now)).toBe(false)
  })
})
