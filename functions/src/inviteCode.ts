import { randomInt } from 'node:crypto'

// No 0/O, 1/I/L: codes get read aloud and typed on phones.
export const INVITE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const INVITE_LENGTH = 6

export function generateInviteCode(): string {
  let code = ''
  for (let i = 0; i < INVITE_LENGTH; i++) {
    code += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)]
  }
  return code
}
