import { getFirestore } from 'firebase-admin/firestore'

const PAGE = 300

async function deleteWhere(field: string, value: string): Promise<void> {
  const db = getFirestore()
  for (;;) {
    const snap = await db.collection('recordingAlerts').where(field, '==', value).limit(PAGE).get()
    if (snap.empty) return
    const batch = db.batch()
    snap.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
}

// A student who is no longer the teacher's: the teacher must not keep seeing their alerts.
export const deleteAlertsOfStudent = (studentId: string) => deleteWhere('studentId', studentId)

// A deleted teacher: everything addressed to her.
export const deleteAlertsOfTeacher = (teacherId: string) => deleteWhere('teacherId', teacherId)
