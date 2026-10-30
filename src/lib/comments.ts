import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

export const MAX_COMMENT_LENGTH = 500

export interface Comment {
  id: string
  text: string
  createdAt: number
  /** When the student read it; null while unread. */
  readAt: number | null
}

const commentsOf = (assignmentId: string, itemId: string) =>
  collection(db, 'assignments', assignmentId, 'items', itemId, 'comments')

export async function listComments(assignmentId: string, itemId: string): Promise<Comment[]> {
  const snap = await getDocs(query(commentsOf(assignmentId, itemId), orderBy('createdAt', 'desc'), limit(20)))
  return snap.docs.map((d) => {
    const x = d.data()
    return {
      id: d.id,
      text: String(x.text ?? ''),
      createdAt: (x.createdAt as Timestamp | undefined)?.toMillis() ?? 0,
      readAt: (x.readAt as Timestamp | null | undefined)?.toMillis() ?? null,
    }
  })
}

// The teacher listened: the time is recorded on the item, and the "new recording" mark goes away.
export async function markHeard(assignmentId: string, itemId: string): Promise<void> {
  await updateDoc(doc(db, 'assignments', assignmentId, 'items', itemId), { recordingSeenAt: serverTimestamp() })
}

// A short reply to a recording. Replying also counts as having listened.
export async function addReply(assignmentId: string, itemId: string, teacherUid: string, text: string): Promise<void> {
  const batch = writeBatch(db)
  batch.set(doc(commentsOf(assignmentId, itemId)), {
    authorId: teacherUid,
    text: text.trim(),
    createdAt: serverTimestamp(),
    readAt: null,
  })
  batch.update(doc(db, 'assignments', assignmentId, 'items', itemId), { recordingSeenAt: serverTimestamp() })
  await batch.commit()
}

export async function editReply(assignmentId: string, itemId: string, commentId: string, text: string): Promise<void> {
  await updateDoc(doc(commentsOf(assignmentId, itemId), commentId), { text: text.trim() })
}


// The student read the replies: each unread one gets the time (the "חדש" mark goes away).
export async function markRepliesRead(assignmentId: string, itemId: string, ids: string[]): Promise<void> {
  const batch = writeBatch(db)
  for (const id of ids) batch.update(doc(commentsOf(assignmentId, itemId), id), { readAt: serverTimestamp() })
  await batch.commit()
}
