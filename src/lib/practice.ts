import { addDoc, collection, getDocs, limit, query, Timestamp, where } from 'firebase/firestore'
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
// only ids and times, nothing personal, and is removed on sign-out. One entry per assignment,
// so practising one assignment, then another, then the first again loses nothing.
const KEY = 'etunley-practice-sessions'

export interface StoredSession {
  uid: string
  assignmentId: string
  state: TimerState
}

type Stored = Record<string, StoredSession>

function readAll(): Stored {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Stored) : {}
  } catch {
    return {}
  }
}

function writeAll(all: Stored): void {
  try {
    if (Object.keys(all).length === 0) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // storage may be blocked; the timer still works
  }
}

export function readSession(uid: string, assignmentId: string): StoredSession | null {
  const found = readAll()[assignmentId]
  return found && found.uid === uid ? found : null
}

export function writeSession(session: StoredSession): void {
  writeAll({ ...readAll(), [session.assignmentId]: session })
}

export function clearSession(assignmentId: string): void {
  const all = readAll()
  delete all[assignmentId]
  writeAll(all)
}

// On sign-out: nothing of anyone is left on the device.
export function clearAllSessions(): void {
  try {
    localStorage.removeItem(KEY)
    localStorage.removeItem('etunley-practice-session')
  } catch {
    // ignore
  }
}

export interface PracticeTotals {
  /** Practice today on this assignment (ms). */
  todayMs: number
  /** All practice on this assignment (ms). */
  totalMs: number
}

// The practice so far on one assignment. All sessions add up, however many times the timer
// was used.
export async function loadPracticeTotals(studentId: string, assignmentId: string): Promise<PracticeTotals> {
  const snap = await getDocs(
    query(
      collection(db, 'practiceLogs'),
      where('studentId', '==', studentId),
      where('assignmentId', '==', assignmentId),
      limit(500),
    ),
  )
  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)
  const totals: PracticeTotals = { todayMs: 0, totalMs: 0 }
  for (const d of snap.docs) {
    const x = d.data()
    const ms = Number(x.seconds ?? 0) * 1000
    totals.totalMs += ms
    const endedAt = (x.endedAt as Timestamp | undefined)?.toMillis() ?? 0
    if (endedAt >= midnight.getTime()) totals.todayMs += ms
  }
  return totals
}
