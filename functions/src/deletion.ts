import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore, type Query } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { STORAGE_BUCKET } from './config'
import { unlinkUpdate, consentEndsWithLink } from './unlink'

const PAGE = 300

const bucket = () => getStorage().bucket(STORAGE_BUCKET)

async function deleteFolder(prefix: string): Promise<void> {
  await bucket().deleteFiles({ prefix, force: true })
}

// Deletes every document a query finds (with everything under it), page by page.
async function deleteAll(query: Query, beforeEach?: (doc: FirebaseFirestore.QueryDocumentSnapshot) => Promise<void>) {
  const db = getFirestore()
  for (;;) {
    const snap = await query.limit(PAGE).get()
    if (snap.empty) return
    for (const doc of snap.docs) {
      if (beforeEach) await beforeEach(doc)
      await db.recursiveDelete(doc.ref)
    }
  }
}

// All recordings of one student: the files, and the "recording" mark on each item.
export async function deleteRecordingsOf(studentId: string): Promise<void> {
  const db = getFirestore()
  await deleteFolder(`recordings/${studentId}/`)
  const assignments = await db.collection('assignments').where('studentId', '==', studentId).get()
  for (const assignment of assignments.docs) {
    const items = await assignment.ref.collection('items').get()
    for (const item of items.docs) {
      if ('recording' in item.data()) await item.ref.update({ recording: FieldValue.delete() })
    }
  }
}


// Permanently deletes a person and everything of theirs. Safe to run again after a
// failure half-way: it looks everything up by the person's id, whatever their role.
// The sign-in account goes last, so a retry is still possible until the very end.
export async function deleteUserData(uid: string): Promise<void> {
  const db = getFirestore()

  // As a student: recordings, assignments (with items and comments), practice, consent.
  await deleteFolder(`recordings/${uid}/`)
  await deleteAll(db.collection('assignments').where('studentId', '==', uid))
  await deleteAll(db.collection('practiceLogs').where('studentId', '==', uid))
  await db.recursiveDelete(db.doc(`parentConsents/${uid}`))

  // As a teacher: their students are unlinked (and keep their own data)...
  for (;;) {
    const students = await db.collection('users').where('teacherId', '==', uid).limit(PAGE).get()
    if (students.empty) break
    for (const student of students.docs) {
      await student.ref.update(unlinkUpdate(student.data()))
      if (consentEndsWithLink(student.data())) await db.recursiveDelete(db.doc(`parentConsents/${student.id}`))
    }
  }
  // ...and what the teacher created goes, including the recordings attached to it.
  await deleteAll(db.collection('assignments').where('teacherId', '==', uid), async (assignment) => {
    const data = assignment.data()
    await deleteFolder(`recordings/${data.studentId}/${assignment.id}/`)
  })
  await deleteAll(db.collection('practiceLogs').where('teacherId', '==', uid))
  await deleteAll(db.collection('templates').where('teacherId', '==', uid))
  await deleteAll(db.collection('parentConsents').where('teacherId', '==', uid))
  await deleteFolder(`sheet-music/${uid}/`)

  const profile = (await db.doc(`users/${uid}`).get()).data()
  if (profile?.inviteCode) await db.doc(`inviteCodes/${profile.inviteCode}`).delete()

  for (const key of [`uid_${uid}`, `consentS_${uid}`, `consentT_${uid}`]) {
    await db.doc(`rateLimits/${key}`).delete()
  }
  await db.recursiveDelete(db.doc(`users/${uid}`))

  try {
    await getAuth().deleteUser(uid)
  } catch (e) {
    if ((e as { code?: string }).code !== 'auth/user-not-found') throw e
  }
}
