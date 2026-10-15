import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { deleteUserData } from './deletion'
import { isRecentLogin, parseUid, requireAdmin, requireSignedIn } from './guards'

// "Delete my account": everything of the person, for good. The app asks for a
// typed confirmation; here a fresh sign-in is required.
export const deleteMyAccount = onCall({ timeoutSeconds: 300 }, async (request) => {
  const uid = requireSignedIn(request)
  if (request.data?.confirm !== true) {
    throw new HttpsError('invalid-argument', 'חסר אישור.')
  }
  if (!isRecentLogin(request.auth?.token.auth_time)) {
    throw new HttpsError('failed-precondition', 'recent-login-required')
  }
  await deleteUserData(uid)
  return { status: 'deleted' as const }
})

// For requests that reach the owner by e-mail (a parent, an adult student).
export const adminLookupUser = onCall(async (request) => {
  requireAdmin(request)
  const email = typeof request.data?.email === 'string' ? request.data.email.trim().toLowerCase() : ''
  if (!email || email.length > 254) throw new HttpsError('invalid-argument', 'כתובת לא תקינה.')
  let account
  try {
    account = await getAuth().getUserByEmail(email)
  } catch {
    return { found: false as const }
  }
  const profile = (await getFirestore().doc(`users/${account.uid}`).get()).data()
  return {
    found: true as const,
    uid: account.uid,
    name: String(profile?.name ?? ''),
    role: (profile?.role as string | undefined) ?? 'none',
    isAdmin: account.customClaims?.admin === true,
  }
})

export const adminDeleteUser = onCall({ timeoutSeconds: 300 }, async (request) => {
  requireAdmin(request)
  const uid = parseUid(request.data?.uid)
  if (uid === request.auth?.uid) {
    throw new HttpsError('failed-precondition', 'את החשבון שלך מוחקים מההגדרות.')
  }
  let account
  try {
    account = await getAuth().getUser(uid)
  } catch {
    throw new HttpsError('not-found', 'המשתמש/ת לא נמצא/ה.')
  }
  if (account.customClaims?.admin === true) {
    throw new HttpsError('failed-precondition', 'אי אפשר למחוק מנהלת מכאן.')
  }
  await deleteUserData(uid)
  return { status: 'deleted' as const }
})
