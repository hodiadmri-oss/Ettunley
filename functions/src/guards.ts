import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'

// The admin claim is set once, by a script run by the owner. The verified
// e-mail requirement stops "pre-hijacking" of the owner's address.
export function requireAdmin(request: CallableRequest): void {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'יש להתחבר.')
  }
  const token = request.auth.token
  if (token.admin !== true || token.email_verified !== true) {
    throw new HttpsError('permission-denied', 'אין הרשאה.')
  }
}

// Firebase user ids are plain letters, digits, dashes and underscores.
export function parseUid(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new HttpsError('invalid-argument', 'מזהה לא תקין.')
  }
  return value
}

export function requireSignedIn(request: CallableRequest): string {
  if (!request.auth) throw new HttpsError('unauthenticated', 'יש להתחבר.')
  return request.auth.uid
}

// Only an approved teacher may manage students (the rules say the same).
export async function requireApprovedTeacher(request: CallableRequest): Promise<string> {
  const uid = requireSignedIn(request)
  const snap = await getFirestore().doc(`users/${uid}`).get()
  const data = snap.data()
  if (!snap.exists || data?.role !== 'teacher' || data.teacherStatus !== 'approved') {
    throw new HttpsError('permission-denied', 'אין הרשאה.')
  }
  return uid
}
