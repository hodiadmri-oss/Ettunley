import { collection, getDocs, limit, query, where } from 'firebase/firestore'
import type { Profile } from '@/auth/profile'
import { db } from '@/lib/firebase'

export interface StudentSummary {
  uid: string
  name: string
  instrument?: string
}

// The teacher's confirmed students (one query, at most 100).
export async function listApprovedStudents(teacherUid: string): Promise<StudentSummary[]> {
  const snap = await getDocs(query(collection(db, 'users'), where('teacherId', '==', teacherUid), limit(100)))
  return snap.docs
    .map((d) => ({ uid: d.id, ...(d.data() as Profile) }))
    .filter((p) => p.linkStatus === 'approved')
    .map((p) => ({ uid: p.uid, name: p.name, instrument: p.instrument }))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'))
}
