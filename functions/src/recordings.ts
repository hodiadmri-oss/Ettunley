import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore'
import { onObjectFinalized } from 'firebase-functions/v2/storage'
import { looksLikeAudio } from './audioSniff'
import { STORAGE_BUCKET } from './config'
import { parseUid, requireSignedIn } from './guards'

const bucket = () => getStorage().bucket(STORAGE_BUCKET)

// A student deletes their own recording of one item: the file and the mark on the item.
// (Deleting runs in a Function; the rules keep denying deletes from the app.)
export const deleteMyRecording = onCall(async (request) => {
  const uid = requireSignedIn(request)
  const assignmentId = parseUid(request.data?.assignmentId)
  const itemId = parseUid(request.data?.itemId)
  const db = getFirestore()

  const assignment = await db.doc(`assignments/${assignmentId}`).get()
  if (!assignment.exists || assignment.data()?.studentId !== uid) {
    throw new HttpsError('not-found', 'המטלה לא נמצאה.')
  }
  await bucket().file(`recordings/${uid}/${assignmentId}/${itemId}`).delete({ ignoreNotFound: true })
  const item = assignment.ref.collection('items').doc(itemId)
  if ((await item.get()).exists) await item.update({ recording: FieldValue.delete() })
  return { status: 'deleted' as const }
})

const RECORDING = /^recordings\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)$/

// Runs after every upload. Recordings: the first bytes must be real audio, otherwise the file
// is deleted and the item loses its mark (the declared type is chosen by the app, not trusted).
// Every upload: any "download token" is removed, so a file can never be opened by a link that
// bypasses the security rules.
export const verifyUpload = onObjectFinalized({ bucket: STORAGE_BUCKET, region: 'me-west1' }, async (event) => {
  const name = event.data.name
  if (!name.startsWith('recordings/') && !name.startsWith('sheet-music/')) return
  const file = bucket().file(name)

  const [metadata] = await file.getMetadata()
  if (metadata.metadata && 'firebaseStorageDownloadTokens' in metadata.metadata) {
    await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: null } })
  }

  const match = RECORDING.exec(name)
  if (!match) return
  const [, , assignmentId, itemId] = match
  const [head] = await file.download({ start: 0, end: 63 })
  if (looksLikeAudio(head)) return

  await file.delete({ ignoreNotFound: true })
  const item = getFirestore().doc(`assignments/${assignmentId}/items/${itemId}`)
  const snap = await item.get()
  if (snap.exists && snap.data()?.recording?.path === name) await item.update({ recording: FieldValue.delete() })
  console.warn('A recording that is not audio was removed')
})

// "A recording waits for the teacher": the recording is there and the teacher has not listened
// to this version of it (listening, or replying, records the time).
export function isWaiting(item: FirebaseFirestore.DocumentData | undefined): boolean {
  const recording = item?.recording
  if (!recording?.uploadedAt) return false
  const seen = item?.recordingSeenAt
  return !seen || seen.toMillis() < recording.uploadedAt.toMillis()
}

// Keeps one small alert per waiting recording (id = assignment + item), so the teacher's home can
// show "recordings waiting" with a single read. Safe to run twice: it only sets or deletes.
export const trackRecordingAlerts = onDocumentWritten('assignments/{assignmentId}/items/{itemId}', async (event) => {
  const { assignmentId, itemId } = event.params
  const alert = getFirestore().doc(`recordingAlerts/${assignmentId}_${itemId}`)
  const after = event.data?.after?.data()
  if (!isWaiting(after)) {
    await alert.delete()
    return
  }
  const assignment = (await getFirestore().doc(`assignments/${assignmentId}`).get()).data()
  if (!assignment) return
  await alert.set({
    teacherId: assignment.teacherId,
    studentId: assignment.studentId,
    assignmentId,
    itemId,
    assignmentTitle: String(assignment.title ?? ''),
    itemTitle: String(after?.title ?? ''),
    uploadedAt: after?.recording.uploadedAt,
  })
})

const DAY_FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' })
const KEEP_DAYS = 60

// "2026-10-29" for a moment, by the clock in Israel.
export const israelDay = (date: Date): string => DAY_FORMAT.format(date)

// Adds one practice session to the student's per-day totals (the last 60 days), which the
// teacher's list reads together with the profile: no extra reads, whatever the number of sessions.
export function addToDays(days: Record<string, number>, day: string, seconds: number, today: string): Record<string, number> {
  const next: Record<string, number> = { ...days, [day]: (days[day] ?? 0) + seconds }
  const oldest = israelDay(new Date(Date.parse(`${today}T12:00:00Z`) - KEEP_DAYS * 24 * 3600 * 1000))
  for (const key of Object.keys(next)) if (key < oldest) delete next[key]
  return next
}

export const trackPracticeLog = onDocumentCreated('practiceLogs/{logId}', async (event) => {
  const log = event.data?.data()
  if (!log || typeof log.studentId !== 'string' || typeof log.seconds !== 'number') return
  const db = getFirestore()
  const ref = db.doc(`users/${log.studentId}`)
  const endedAt = log.endedAt?.toDate?.() ?? new Date()
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) return // a deleted student must not be brought back
    const days = addToDays(snap.data()?.practiceDays ?? {}, israelDay(endedAt), log.seconds, israelDay(new Date()))
    tx.update(ref, { practiceDays: days })
  })
})
