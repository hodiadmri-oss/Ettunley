import { collection, getDocs, limit, orderBy, query, Timestamp, where } from 'firebase/firestore'
import { isWaiting, listItems, type Assignment } from '@/lib/assignments'
import { db } from '@/lib/firebase'

// What the student's home list shows next to each assignment.
export interface AssignmentInfo {
  /** Items the student marked "ready", and how many items there are. Null when not loaded. */
  ready: number | null
  total: number | null
  /** Practice today and in all, in milliseconds. Null when not loaded. */
  todayMs: number | null
  totalMs: number | null
  /** Recordings the teacher has not listened to yet. */
  waiting: number | null
}

// The status of items is read for the newest assignments only, and the practice from the newest
// 300 sessions: both are bounded, so the list stays cheap however long the student has been here.
const MAX_ASSIGNMENTS_WITH_STATUS = 15
const MAX_LOGS = 300

// The teacher's list of one student's assignments uses it too (then `teacherId` is given, as the
// security rules need it for her query).
export async function loadOverview(
  studentId: string,
  assignments: Assignment[],
  teacherId?: string,
): Promise<Record<string, AssignmentInfo>> {
  const info: Record<string, AssignmentInfo> = {}
  for (const a of assignments) info[a.id] = { ready: null, total: null, todayMs: null, totalMs: null, waiting: null }

  const statuses = Promise.all(
    assignments.slice(0, MAX_ASSIGNMENTS_WITH_STATUS).map(async (a) => {
      try {
        const items = await listItems(a.id)
        info[a.id].total = items.length
        info[a.id].ready = items.filter((i) => i.status === 'ready').length
        info[a.id].waiting = items.filter(isWaiting).length
      } catch {
        // no status for this one
      }
    }),
  )

  const practice = (async () => {
    try {
      const snap = await getDocs(
        query(
          collection(db, 'practiceLogs'),
          where('studentId', '==', studentId),
          ...(teacherId ? [where('teacherId', '==', teacherId)] : []),
          orderBy('endedAt', 'desc'),
          limit(MAX_LOGS),
        ),
      )
      const midnight = new Date()
      midnight.setHours(0, 0, 0, 0)
      for (const a of assignments) {
        info[a.id].todayMs = 0
        info[a.id].totalMs = 0
      }
      for (const d of snap.docs) {
        const x = d.data()
        const entry = info[String(x.assignmentId)]
        if (!entry) continue
        const ms = Number(x.seconds ?? 0) * 1000
        entry.totalMs = (entry.totalMs ?? 0) + ms
        if (((x.endedAt as Timestamp | undefined)?.toMillis() ?? 0) >= midnight.getTime()) entry.todayMs = (entry.todayMs ?? 0) + ms
      }
    } catch {
      // no practice times (for example while the index is still being built)
    }
  })()

  await Promise.all([statuses, practice])
  return info
}
