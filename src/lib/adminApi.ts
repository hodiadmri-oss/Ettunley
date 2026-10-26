import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'

export interface TeacherRow {
  uid: string
  name: string
  email: string
  emailVerified: boolean
  status: 'pending' | 'approved'
  studentCount: number
  createdAt: number | null
  copyrightStatementAt: number | null
}

export async function listTeachers(): Promise<TeacherRow[]> {
  const result = await httpsCallable<void, { teachers: TeacherRow[] }>(functions, 'listTeachers')()
  return result.data.teachers
}

export async function approveTeacher(uid: string): Promise<void> {
  await httpsCallable(functions, 'approveTeacher')({ uid })
}

export async function rejectTeacher(uid: string): Promise<void> {
  await httpsCallable(functions, 'rejectTeacher')({ uid })
}
