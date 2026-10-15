import {
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  type User,
} from 'firebase/auth'

const FRESH_MS = 4 * 60 * 1000 // a little less than the 5 minutes the server accepts

// Deleting an account needs a recent sign-in.
export async function isLoginFresh(user: User): Promise<boolean> {
  const { authTime } = await user.getIdTokenResult()
  return Date.now() - Date.parse(authTime) < FRESH_MS
}

export const usesPassword = (user: User) => user.providerData.some((p) => p.providerId === 'password')

export async function reauthWithPassword(user: User, password: string): Promise<void> {
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email ?? '', password))
  await user.getIdToken(true) // a new token that carries the new sign-in time
}

export async function reauthWithGoogle(user: User): Promise<void> {
  await reauthenticateWithPopup(user, new GoogleAuthProvider())
  await user.getIdToken(true)
}
