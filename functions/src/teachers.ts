import { getAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { requireAdmin, parseUid } from './guards'
import { generateInviteCode } from './inviteCode'

const MAX_TEACHERS_LISTED = 200
const MAX_CODE_ATTEMPTS = 10

class InviteCodeTaken extends Error {}

const millis = (value: unknown): number | null => (value instanceof Timestamp ? value.toMillis() : null)

// The admin page needs e-mail addresses, which are kept in Firebase Authentication
// and deliberately not copied into the database.
export const listTeachers = onCall(async (request) => {
  requireAdmin(request)
  const snap = await getFirestore()
    .collection('users')
    .where('role', '==', 'teacher')
    .where('teacherStatus', 'in', ['pending', 'approved'])
    .limit(MAX_TEACHERS_LISTED)
    .get()

  const emails = new Map<string, { email: string; verified: boolean }>()
  const uids = snap.docs.map((d) => d.id)
  for (let i = 0; i < uids.length; i += 100) {
    const batch = await getAuth().getUsers(uids.slice(i, i + 100).map((uid) => ({ uid })))
    for (const u of batch.users) emails.set(u.uid, { email: u.email ?? '', verified: u.emailVerified })
  }

  // Only confirmed students are counted (one small count query per teacher).
  const studentCounts = await Promise.all(
    snap.docs.map(async (d) => {
      if (d.data().teacherStatus !== 'approved') return 0
      const count = await getFirestore()
        .collection('users')
        .where('teacherId', '==', d.id)
        .where('linkStatus', '==', 'approved')
        .count()
        .get()
      return count.data().count
    }),
  )

  const teachers = snap.docs.map((d, i) => {
    const data = d.data()
    const account = emails.get(d.id)
    return {
      studentCount: studentCounts[i],
      uid: d.id,
      name: String(data.name ?? ''),
      email: account?.email ?? '',
      emailVerified: account?.verified ?? false,
      status: data.teacherStatus as 'pending' | 'approved',
      createdAt: millis(data.createdAt),
      copyrightStatementAt: millis(data.copyrightStatementAt),
    }
  })
  return { teachers }
})

export const approveTeacher = onCall(async (request) => {
  requireAdmin(request)
  const uid = parseUid(request.data?.uid)
  const db = getFirestore()

  let account
  try {
    account = await getAuth().getUser(uid)
  } catch {
    throw new HttpsError('not-found', 'המשתמש/ת לא נמצא/ה.')
  }
  if (!account.emailVerified) {
    throw new HttpsError('failed-precondition', 'האימייל של המורה לא מאומת.')
  }
  if (!account.providerData.some((p) => p.providerId === 'google.com')) {
    throw new HttpsError('failed-precondition', 'מורים נכנסים עם Google בלבד.')
  }

  // The invite code is created together with the approval, or not at all.
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateInviteCode()
    try {
      await db.runTransaction(async (tx) => {
        const userRef = db.doc(`users/${uid}`)
        const user = await tx.get(userRef)
        const data = user.data()
        if (!user.exists || data?.role !== 'teacher') {
          throw new HttpsError('failed-precondition', 'זה לא חשבון של מורה.')
        }
        if (data.teacherStatus === 'approved') return // already done: nothing to change
        if (data.teacherStatus !== 'pending') {
          throw new HttpsError('failed-precondition', 'אפשר לאשר רק חשבון שממתין לאישור.')
        }
        if (!data.copyrightStatementAt) {
          throw new HttpsError('failed-precondition', 'המורה עוד לא אישרה את הצהרת זכויות היוצרים.')
        }
        const codeRef = db.doc(`inviteCodes/${code}`)
        if ((await tx.get(codeRef)).exists) throw new InviteCodeTaken()
        tx.create(codeRef, { teacherId: uid })
        tx.update(userRef, { teacherStatus: 'approved', inviteCode: code })
      })
      return { status: 'approved' as const }
    } catch (e) {
      if (e instanceof InviteCodeTaken) continue
      throw e
    }
  }
  throw new HttpsError('internal', 'לא הצלחנו ליצור קוד הזמנה. אפשר לנסות שוב.')
})

export const rejectTeacher = onCall(async (request) => {
  requireAdmin(request)
  const uid = parseUid(request.data?.uid)
  const db = getFirestore()
  await db.runTransaction(async (tx) => {
    const userRef = db.doc(`users/${uid}`)
    const user = await tx.get(userRef)
    const data = user.data()
    if (!user.exists || data?.role !== 'teacher') {
      throw new HttpsError('failed-precondition', 'זה לא חשבון של מורה.')
    }
    if (data.teacherStatus === 'rejected') return
    if (data.teacherStatus !== 'pending') {
      throw new HttpsError('failed-precondition', 'אפשר לדחות רק חשבון שממתין לאישור.')
    }
    tx.update(userRef, { teacherStatus: 'rejected' })
  })
  return { status: 'rejected' as const }
})
