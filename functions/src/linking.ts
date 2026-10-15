import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { parseUid, requireApprovedTeacher, requireSignedIn } from './guards'
import { generateInviteCode, INVITE_ALPHABET, INVITE_LENGTH } from './inviteCode'
import { consumeAttempt, ipKey, resetAttempts } from './rateLimit'

const MAX_WRONG_CODES_PER_USER = 5
const MAX_WRONG_CODES_PER_IP = 30
const MAX_CODE_ATTEMPTS = 10

const CODE_FORMAT = new RegExp(`^[${INVITE_ALPHABET}]{${INVITE_LENGTH}}$`)

// "no such code", "wrong format", "not allowed to try again yet" all look the same
// from the outside, so nobody can learn which codes exist.
const invalidCode = () => new HttpsError('permission-denied', 'הקוד לא נכון.')

const CLEAR_LINK = {
  teacherId: FieldValue.delete(),
  teacherName: FieldValue.delete(),
  linkStatus: FieldValue.delete(),
}

// A student types the teacher's code. This only creates a *pending* link;
// the teacher has to confirm.
export const joinTeacher = onCall(async (request) => {
  const uid = requireSignedIn(request)
  const db = getFirestore()
  const code = String(request.data?.code ?? '').replace(/\s+/g, '').toUpperCase()

  const userAllowed = await consumeAttempt(`uid_${uid}`, MAX_WRONG_CODES_PER_USER)
  const ip = ipKey(request.rawRequest?.ip)
  const ipAllowed = ip ? await consumeAttempt(ip, MAX_WRONG_CODES_PER_IP) : true
  if (!userAllowed || !ipAllowed || !CODE_FORMAT.test(code)) throw invalidCode()

  const linked = await db.runTransaction(async (tx) => {
    const studentRef = db.doc(`users/${uid}`)
    const student = await tx.get(studentRef)
    if (!student.exists || student.data()?.role !== 'student') {
      throw new HttpsError('permission-denied', 'רק תלמידים יכולים להצטרף למורה.')
    }
    if (student.data()?.teacherId) {
      throw new HttpsError('failed-precondition', 'כבר יש מורה.')
    }
    const codeSnap = await tx.get(db.doc(`inviteCodes/${code}`))
    if (!codeSnap.exists) return false
    const teacherId = codeSnap.data()?.teacherId as string
    const teacher = await tx.get(db.doc(`users/${teacherId}`))
    const t = teacher.data()
    // Only the teacher's current code counts, and only while they are approved.
    if (!teacher.exists || t?.role !== 'teacher' || t.teacherStatus !== 'approved' || t.inviteCode !== code) {
      return false
    }
    tx.update(studentRef, { teacherId, teacherName: t.name, linkStatus: 'pending' })
    return true
  })
  if (!linked) throw invalidCode()

  await resetAttempts(`uid_${uid}`)
  return { status: 'pending' as const }
})

async function changeStudentLink(
  teacherUid: string,
  studentId: string,
  change: (data: FirebaseFirestore.DocumentData) => Record<string, unknown> | null,
) {
  const db = getFirestore()
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`users/${studentId}`)
    const snap = await tx.get(ref)
    const data = snap.data()
    // Someone else's student looks exactly like a student that does not exist.
    if (!snap.exists || data?.role !== 'student' || data.teacherId !== teacherUid) {
      throw new HttpsError('permission-denied', 'אין הרשאה.')
    }
    const update = change(data)
    if (update) tx.update(ref, update)
  })
}

// The teacher confirms or turns down a student who typed their code.
export const respondToStudent = onCall(async (request) => {
  const teacherUid = await requireApprovedTeacher(request)
  const studentId = parseUid(request.data?.studentId)
  const decision = request.data?.decision
  if (decision !== 'approve' && decision !== 'reject') {
    throw new HttpsError('invalid-argument', 'החלטה לא תקינה.')
  }
  await changeStudentLink(teacherUid, studentId, (student) => {
    if (decision === 'approve') {
      if (student.linkStatus === 'approved') return null // already done
      if (student.linkStatus !== 'pending') throw new HttpsError('failed-precondition', 'הבקשה כבר לא ממתינה.')
      return { linkStatus: 'approved' }
    }
    if (student.linkStatus !== 'pending') throw new HttpsError('failed-precondition', 'הבקשה כבר לא ממתינה.')
    return CLEAR_LINK
  })
  return { status: decision === 'approve' ? ('approved' as const) : ('rejected' as const) }
})

// Removing a student cuts the teacher's access at once (the rules look at this link).
// The student's own data stays theirs.
export const removeStudent = onCall(async (request) => {
  const teacherUid = await requireApprovedTeacher(request)
  const studentId = parseUid(request.data?.studentId)
  await changeStudentLink(teacherUid, studentId, () => CLEAR_LINK)
  return { status: 'removed' as const }
})

// A new code for a teacher whose code leaked. The old code stops working at once.
export const regenerateInviteCode = onCall(async (request) => {
  const uid = await requireApprovedTeacher(request)
  const db = getFirestore()
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateInviteCode()
    const created = await db.runTransaction(async (tx) => {
      const userRef = db.doc(`users/${uid}`)
      const user = await tx.get(userRef)
      const oldCode = user.data()?.inviteCode as string | undefined
      const newRef = db.doc(`inviteCodes/${code}`)
      if ((await tx.get(newRef)).exists) return false
      tx.create(newRef, { teacherId: uid })
      if (oldCode) tx.delete(db.doc(`inviteCodes/${oldCode}`))
      tx.update(userRef, { inviteCode: code })
      return true
    })
    if (created) return { status: 'done' as const }
  }
  throw new HttpsError('internal', 'לא הצלחנו ליצור קוד חדש. אפשר לנסות שוב.')
})

// A student who typed a wrong teacher's code can take the request back, but only
// while it is still waiting. Once the teacher confirmed, only the teacher can remove.
export const cancelJoinRequest = onCall(async (request) => {
  const uid = requireSignedIn(request)
  const db = getFirestore()
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`users/${uid}`)
    const snap = await tx.get(ref)
    const data = snap.data()
    if (!snap.exists || data?.role !== 'student') {
      throw new HttpsError('permission-denied', 'אין הרשאה.')
    }
    if (data.linkStatus !== 'pending') {
      throw new HttpsError('failed-precondition', 'אין בקשה שממתינה.')
    }
    tx.update(ref, CLEAR_LINK)
  })
  return { status: 'cancelled' as const }
})
