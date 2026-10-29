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

export interface AdminFile {
  path: string
  name: string
  size: number
  contentType: string
  uploadedAt: number | null
  uses: { kind: 'assignment' | 'template'; title: string }[]
}

export async function listTeacherFiles(teacherUid: string): Promise<{ files: AdminFile[]; truncated: boolean }> {
  const result = await httpsCallable<{ teacherUid: string }, { files: AdminFile[]; truncated: boolean }>(
    functions,
    'adminListFiles',
  )({ teacherUid })
  return result.data
}

export async function removeTeacherFile(path: string): Promise<void> {
  await httpsCallable(functions, 'adminRemoveFile')({ path })
}

export interface AdminStudent {
  name: string
  instrument: string
  isMinor: boolean
  hasConsent: boolean
  confirmed: boolean
}

export async function listTeacherStudents(teacherUid: string): Promise<AdminStudent[]> {
  const result = await httpsCallable<{ teacherUid: string }, { students: AdminStudent[] }>(
    functions,
    'adminListStudents',
  )({ teacherUid })
  return result.data.students
}

export interface AdminFileContent {
  name: string
  contentType: string
  dataBase64: string
}

export async function readTeacherFile(path: string): Promise<AdminFileContent> {
  const result = await httpsCallable<{ path: string }, AdminFileContent>(functions, 'adminReadFile')({ path })
  return result.data
}
