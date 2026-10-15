import { doc, getDoc, serverTimestamp, setDoc, type Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { MAX_NAME_LENGTH } from '@/lib/strings'

export type Role = 'teacher' | 'student'

export interface Profile {
  role: Role
  name: string
  createdAt?: Timestamp
  // Teachers only. Written by Cloud Functions, never by the client.
  teacherStatus?: 'pending' | 'approved' | 'rejected'
}

export function cleanName(raw: string | null | undefined): string {
  return (raw ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH)
}

export async function loadProfile(uid: string): Promise<Profile | null> {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? (snap.data() as Profile) : null
}

// The role is written here once; the security rules make it immutable.
export async function createProfile(uid: string, role: Role, name: string): Promise<Profile> {
  const base = { role, name, createdAt: serverTimestamp() }
  await setDoc(
    doc(db, 'users', uid),
    role === 'teacher' ? { ...base, teacherStatus: 'pending' } : base,
  )
  return (await loadProfile(uid)) as Profile
}
