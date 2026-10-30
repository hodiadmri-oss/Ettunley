import { collection, getDocs, limit, query, Timestamp, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// "A recording waits for you to listen" (kept by a Function, one small document each).
export interface RecordingAlert {
  id: string
  studentId: string
  assignmentId: string
  itemId: string
  assignmentTitle: string
  itemTitle: string
  uploadedAt: number
}

export async function listRecordingAlerts(teacherId: string): Promise<RecordingAlert[]> {
  const snap = await getDocs(query(collection(db, 'recordingAlerts'), where('teacherId', '==', teacherId), limit(100)))
  return snap.docs
    .map((d) => {
      const x = d.data()
      return {
        id: d.id,
        studentId: String(x.studentId),
        assignmentId: String(x.assignmentId),
        itemId: String(x.itemId),
        assignmentTitle: String(x.assignmentTitle ?? ''),
        itemTitle: String(x.itemTitle ?? ''),
        uploadedAt: (x.uploadedAt as Timestamp | undefined)?.toMillis() ?? 0,
      }
    })
    .sort((a, b) => b.uploadedAt - a.uploadedAt)
}

// "The teacher replied and you have not read it" (kept by a Function, one per item).
export interface ReplyAlert {
  id: string
  assignmentId: string
  assignmentTitle: string
  itemTitle: string
  preview: string
  count: number
}

export async function listReplyAlerts(studentId: string): Promise<ReplyAlert[]> {
  const snap = await getDocs(query(collection(db, 'replyAlerts'), where('studentId', '==', studentId), limit(100)))
  return snap.docs.map((d) => {
    const x = d.data()
    return {
      id: d.id,
      assignmentId: String(x.assignmentId),
      assignmentTitle: String(x.assignmentTitle ?? ''),
      itemTitle: String(x.itemTitle ?? ''),
      preview: String(x.preview ?? ''),
      count: Number(x.count ?? 1),
    }
  })
}
