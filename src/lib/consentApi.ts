import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'

export type ConsentInfo =
  | { valid: false }
  | { valid: true; childName: string; teacherName: string; textVersion: number }

export async function getParentConsentInfo(token: string): Promise<ConsentInfo> {
  const result = await httpsCallable<{ token: string }, ConsentInfo>(functions, 'getParentConsentInfo')({ token })
  return result.data
}

export async function approveParentConsent(token: string, parentName: string, textVersion: number): Promise<void> {
  await httpsCallable(functions, 'approveParentConsent')({ token, parentName, textVersion })
}

export async function sendParentConsent(studentId: string, parentEmail: string): Promise<void> {
  await httpsCallable(functions, 'sendParentConsent')({ studentId, parentEmail })
}

export function sendConsentErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'functions/invalid-argument':
      return 'כתובת האימייל לא תקינה.'
    case 'functions/resource-exhausted':
      return 'נשלחו יותר מדי הודעות. אפשר לנסות שוב מחר.'
    case 'functions/failed-precondition':
      return 'אי אפשר לשלוח כרגע. אפשר לרענן את הדף.'
    default:
      return 'השליחה לא הצליחה. אפשר לנסות שוב.'
  }
}
