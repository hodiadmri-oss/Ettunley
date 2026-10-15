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
