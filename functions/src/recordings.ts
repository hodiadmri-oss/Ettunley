import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
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
