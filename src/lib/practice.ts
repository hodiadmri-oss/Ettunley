import { addDoc, collection, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { PracticeResult, TimerState } from '@/lib/practiceTimer'

// One practice session, saved when the student presses "finished".
export async function savePractice(
  studentId: string,
  teacherId: string,
  assignmentId: string,
  result: PracticeResult,
): Promise<void> {
  await addDoc(collection(db, 'practiceLogs'), {
    studentId,
    teacherId,
    assignmentId,
    seconds: result.seconds,
    startedAt: Timestamp.fromMillis(result.startedAt),
    endedAt: Timestamp.fromMillis(result.endedAt),
  })
}

// A running session is kept on the device so a closed app can offer to save it. It holds
// only ids and times, nothing personal, and is removed on sign-out.
const KEY = 'etunley-practice-session'

export interface StoredSession {
  uid: string
  assignmentId: string
  state: TimerState
}

export function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as StoredSession) : null
  } catch {
    return null
  }
}

export function writeSession(session: StoredSession): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    // storage may be blocked; the timer still works
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
