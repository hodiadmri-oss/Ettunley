import { describe, expect, it } from 'vitest'
import { generateInviteCode, INVITE_ALPHABET } from '../../functions/src/inviteCode'

describe('generateInviteCode', () => {
  it('makes 6 characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 500; i++) {
      expect(generateInviteCode()).toMatch(new RegExp(`^[${INVITE_ALPHABET}]{6}$`))
    }
  })

  it('has no look-alike characters', () => {
    expect(INVITE_ALPHABET).not.toMatch(/[01OIL]/)
  })

  it('does not repeat itself in practice', () => {
    const codes = new Set(Array.from({ length: 2000 }, generateInviteCode))
    expect(codes.size).toBeGreaterThan(1990)
  })
})
