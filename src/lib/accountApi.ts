import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'

export const DELETE_WORD = 'מחיקה'

export async function deleteMyAccount(): Promise<void> {
  await httpsCallable(functions, 'deleteMyAccount')({ confirm: true })
}

export interface LookedUpUser {
  found: true
  uid: string
  name: string
  role: 'teacher' | 'student' | 'none'
  isAdmin: boolean
}

export async function adminLookupUser(email: string): Promise<LookedUpUser | { found: false }> {
  const result = await httpsCallable<{ email: string }, LookedUpUser | { found: false }>(functions, 'adminLookupUser')({ email })
  return result.data
}

export async function adminDeleteUser(uid: string): Promise<void> {
  await httpsCallable(functions, 'adminDeleteUser')({ uid })
}

export async function getParentManageInfo(token: string) {
  const result = await httpsCallable<{ token: string }, { valid: false } | { valid: true; childName: string; hasConsent: boolean }>(
    functions,
    'getParentManageInfo',
  )({ token })
  return result.data
}

export async function manageParentConsent(token: string, action: 'withdraw' | 'delete'): Promise<void> {
  await httpsCallable(functions, 'manageParentConsent')({ token, action })
}
