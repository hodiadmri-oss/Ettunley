import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { STORAGE_BUCKET } from './config'
import { parseUid, requireAdmin, requireApprovedTeacher } from './guards'

const bucket = () => getStorage().bucket(STORAGE_BUCKET)

const MAX_FILES_LISTED = 200
const MAX_USES_SHOWN = 5
// The item fields that point to a file in the teacher's folder.
const FILE_FIELDS = ['sheetPath', 'accompanimentPath'] as const
const SHEET_PATH = /^sheet-music\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9._-]{1,200}$/

// A teacher deletes one of their own assignments, for a student who is still theirs.
// Gone with it: the items, the replies, the sheet music files of the assignment and the
// student's recordings attached to it. The student's practice minutes stay (they are the
// student's own record of effort).
export const deleteAssignment = onCall(async (request) => {
  const teacherId = await requireApprovedTeacher(request)
  const assignmentId = parseUid(request.data?.assignmentId)
  const db = getFirestore()

  const ref = db.doc(`assignments/${assignmentId}`)
  const snap = await ref.get()
  const assignment = snap.data()
  if (!snap.exists || !assignment || assignment.teacherId !== teacherId) {
    throw new HttpsError('not-found', 'המטלה לא נמצאה.')
  }
  const student = (await db.doc(`users/${assignment.studentId}`).get()).data()
  if (student?.teacherId !== teacherId || student?.linkStatus !== 'approved') {
    throw new HttpsError('permission-denied', 'אין הרשאה.')
  }

  const items = await ref.collection('items').get()
  const ownFolder = `sheet-music/${teacherId}/`
  const sheets = items.docs
    .flatMap((d) => [d.data().sheetPath, d.data().accompanimentPath])
    .filter((p): p is string => typeof p === 'string' && p.startsWith(ownFolder))

  // Files first: if something fails the assignment still exists and the teacher can retry.
  await bucket().deleteFiles({ prefix: `recordings/${assignment.studentId}/${assignmentId}/`, force: true })
  for (const path of sheets) await bucket().file(path).delete({ ignoreNotFound: true })
  await db.recursiveDelete(ref)
  return { status: 'deleted' }
})

interface FileUse {
  kind: 'assignment' | 'template'
  title: string
}

// The owner looks at the files one teacher has uploaded (name, size, date, where it is used).
export const adminListFiles = onCall(async (request) => {
  requireAdmin(request)
  const teacherUid = parseUid(request.data?.teacherUid)
  const db = getFirestore()

  const [files] = await bucket().getFiles({ prefix: `sheet-music/${teacherUid}/`, maxResults: MAX_FILES_LISTED })
  const out = []
  for (const file of files) {
    const uses: FileUse[] = []
    for (const field of FILE_FIELDS) {
      const items = await db.collectionGroup('items').where(field, '==', file.name).limit(MAX_USES_SHOWN).get()
      for (const item of items.docs) {
        const parent = item.ref.parent.parent
        const data = parent ? (await parent.get()).data() : undefined
        if (parent && data) {
          uses.push({ kind: parent.parent.id === 'templates' ? 'template' : 'assignment', title: String(data.title ?? '') })
        }
      }
    }
    out.push({
      path: file.name,
      name: String(file.metadata.metadata?.name ?? ''),
      size: Number(file.metadata.size ?? 0),
      contentType: String(file.metadata.contentType ?? ''),
      uploadedAt: file.metadata.timeCreated ? Date.parse(String(file.metadata.timeCreated)) : null,
      uses,
    })
  }
  out.sort((a, b) => (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0))
  return { files: out, truncated: files.length >= MAX_FILES_LISTED }
})

// The owner removes one file (for example after a copyright complaint). The file is
// deleted and every item that pointed to it simply has no sheet music any more.
export const adminRemoveFile = onCall(async (request) => {
  requireAdmin(request)
  const path = request.data?.path
  if (typeof path !== 'string' || !SHEET_PATH.test(path)) {
    throw new HttpsError('invalid-argument', 'נתיב לא תקין.')
  }
  const db = getFirestore()
  await bucket().file(path).delete({ ignoreNotFound: true })
  let cleared = 0
  for (const field of FILE_FIELDS) {
    const items = await db.collectionGroup('items').where(field, '==', path).get()
    for (const item of items.docs) await item.ref.update({ [field]: FieldValue.delete() })
    cleared += items.size
  }
  return { status: 'removed', cleared }
})

// The owner can look at a file a teacher uploaded (to check what is being shared with
// children). The file is sent through the function, never through a public link. Large
// files are refused here, because a callable response is limited in size.
const MAX_PREVIEW_BYTES = 6 * 1024 * 1024

export const adminReadFile = onCall({ memory: '512MiB' }, async (request) => {
  requireAdmin(request)
  const path = request.data?.path
  if (typeof path !== 'string' || !SHEET_PATH.test(path)) {
    throw new HttpsError('invalid-argument', 'נתיב לא תקין.')
  }
  const file = bucket().file(path)
  const [exists] = await file.exists()
  if (!exists) throw new HttpsError('not-found', 'הקובץ לא נמצא.')
  const [metadata] = await file.getMetadata()
  if (Number(metadata.size ?? 0) > MAX_PREVIEW_BYTES) {
    throw new HttpsError('failed-precondition', 'too-large')
  }
  const [content] = await file.download()
  return {
    name: String(metadata.metadata?.name ?? ''),
    contentType: String(metadata.contentType ?? ''),
    dataBase64: content.toString('base64'),
  }
})

// The owner sees which students are connected to a teacher (names only, no e-mail).
export const adminListStudents = onCall(async (request) => {
  requireAdmin(request)
  const teacherUid = parseUid(request.data?.teacherUid)
  const snap = await getFirestore().collection('users').where('teacherId', '==', teacherUid).limit(200).get()
  const students = snap.docs
    .map((d) => d.data())
    .map((x) => ({
      name: String(x.name ?? ''),
      instrument: typeof x.instrument === 'string' ? x.instrument : '',
      isMinor: x.isMinor === true,
      hasConsent: Boolean(x.consentAt),
      confirmed: x.linkStatus === 'approved',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'))
  return { students }
})
