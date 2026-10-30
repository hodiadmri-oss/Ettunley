import { getFirestore } from 'firebase-admin/firestore'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'

// Keeps one small alert per item that has a teacher reply the student has not read yet
// (id = assignment + item), so the student's home can show "חדש" with a single read.
// Safe to run twice: it only sets or deletes.
export const trackReplyAlerts = onDocumentWritten('assignments/{assignmentId}/items/{itemId}/comments/{commentId}', async (event) => {
  const { assignmentId, itemId } = event.params
  const db = getFirestore()
  const alert = db.doc(`replyAlerts/${assignmentId}_${itemId}`)
  const unread = await db.collection(`assignments/${assignmentId}/items/${itemId}/comments`).where('readAt', '==', null).limit(20).get()
  if (unread.empty) {
    await alert.delete()
    return
  }
  const assignment = (await db.doc(`assignments/${assignmentId}`).get()).data()
  if (!assignment) return
  await alert.set({
    teacherId: assignment.teacherId,
    studentId: assignment.studentId,
    assignmentId,
    itemId,
    assignmentTitle: String(assignment.title ?? ''),
    count: unread.size,
  })
})
