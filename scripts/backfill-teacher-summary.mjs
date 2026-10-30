// Fills in what the teacher's screen shows for things that happened BEFORE the Functions that
// keep it up to date were published:
//   - each student's practice per day (the last 60 days), from the practice logs
//   - one "recording waits" alert per recording the teacher has not listened to
// It is safe to run again: it only sets the same values. Run it in Google Cloud Shell
// (it uses your own login, no key file):   node scripts/backfill-teacher-summary.mjs
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'ettunley-61749' })
const db = getFirestore()

const dayOf = (date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
const oldest = dayOf(new Date(Date.now() - 60 * 24 * 3600 * 1000))

// 1. Practice per day
const perStudent = new Map()
let last = null
for (;;) {
  let q = db.collection('practiceLogs').orderBy('__name__').limit(500)
  if (last) q = q.startAfter(last)
  const snap = await q.get()
  if (snap.empty) break
  for (const doc of snap.docs) {
    const log = doc.data()
    if (typeof log.studentId !== 'string' || typeof log.seconds !== 'number') continue
    const day = dayOf(log.endedAt.toDate())
    if (day < oldest) continue
    const days = perStudent.get(log.studentId) ?? {}
    days[day] = (days[day] ?? 0) + log.seconds
    perStudent.set(log.studentId, days)
  }
  last = snap.docs[snap.docs.length - 1]
}
let students = 0
for (const [studentId, days] of perStudent) {
  const ref = db.doc(`users/${studentId}`)
  if (!(await ref.get()).exists) continue
  await ref.update({ practiceDays: days })
  students++
}

// 2. Recordings that wait for the teacher
let alerts = 0
const items = await db.collectionGroup('items').where('recording.uploadedAt', '>', new Date(0)).get()
for (const item of items.docs) {
  const data = item.data()
  const seen = data.recordingSeenAt
  if (seen && seen.toMillis() >= data.recording.uploadedAt.toMillis()) continue
  const assignmentRef = item.ref.parent.parent
  const assignment = (await assignmentRef.get()).data()
  if (!assignment) continue
  await db.doc(`recordingAlerts/${assignmentRef.id}_${item.id}`).set({
    teacherId: assignment.teacherId,
    studentId: assignment.studentId,
    assignmentId: assignmentRef.id,
    itemId: item.id,
    assignmentTitle: String(assignment.title ?? ''),
    itemTitle: String(data.title ?? ''),
    uploadedAt: data.recording.uploadedAt,
  })
  alerts++
}
console.log(`Done: practice summary for ${students} student(s), ${alerts} recording alert(s).`)
