import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'

export async function joinTeacher(code: string): Promise<void> {
  await httpsCallable(functions, 'joinTeacher')({ code })
}

export async function respondToStudent(studentId: string, decision: 'approve' | 'reject'): Promise<void> {
  await httpsCallable(functions, 'respondToStudent')({ studentId, decision })
}

export async function removeStudent(studentId: string): Promise<void> {
  await httpsCallable(functions, 'removeStudent')({ studentId })
}

export async function regenerateInviteCode(): Promise<void> {
  await httpsCallable(functions, 'regenerateInviteCode')()
}

// Short Hebrew message for a failed join. The wording is the same for "wrong code"
// and "too many tries", on purpose.
export function joinErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'functions/permission-denied':
      return 'הקוד לא נכון. כדאי לבדוק אותו ולנסות שוב. אחרי כמה ניסיונות שגויים צריך לחכות קצת.'
    case 'functions/failed-precondition':
      return 'כבר מקושרים למורה.'
    case 'functions/unavailable':
    case 'functions/internal':
      return 'אין חיבור כרגע. אפשר לנסות שוב.'
    default:
      return 'משהו השתבש. אפשר לנסות שוב.'
  }
}
