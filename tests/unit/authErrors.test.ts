import { describe, expect, it } from 'vitest'
import { authErrorMessage } from '../../src/lib/authErrors'

describe('authErrorMessage', () => {
  it('stays silent when the person closes the Google window', () => {
    expect(authErrorMessage('auth/popup-closed-by-user')).toBeNull()
  })

  it('does not reveal whether an e-mail exists when the login fails', () => {
    const wrongPassword = authErrorMessage('auth/wrong-password')
    expect(wrongPassword).toBe(authErrorMessage('auth/user-not-found'))
    expect(wrongPassword).toBe(authErrorMessage('auth/invalid-credential'))
  })

  it('has a Hebrew message for unknown errors', () => {
    expect(authErrorMessage('auth/something-new')).toMatch(/[א-ת]/)
    expect(authErrorMessage(undefined)).toMatch(/[א-ת]/)
  })
})
