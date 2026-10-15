import { doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { isMinorAt } from '@/lib/age'
import { MAX_NAME_LENGTH } from '@/lib/strings'

export type Role = 'teacher' | 'student'

export interface Profile {
  role: Role
  name: string
  createdAt?: Timestamp
  // Teachers only. Written by Cloud Functions, never by the client.
  teacherStatus?: 'pending' | 'approved' | 'rejected'
  // Students only.
  birthDate?: Timestamp
  isMinor?: boolean
  instrument?: string
  level?: 'beginner' | 'intermediate' | 'advanced'
  consentBy?: 'self' | 'parent'
  consentAt?: Timestamp
  // Written by Cloud Functions when the student joins a teacher.
  teacherId?: string
  teacherName?: string
  linkStatus?: 'pending' | 'approved'
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

// Each field is saved as soon as it changes. Birth date and isMinor are written
// together, once; the rules refuse any later change.
export async function saveStudentFields(
  uid: string,
  fields: { name?: string; instrument?: string; level?: Profile['level'] },
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), fields)
}

export async function saveBirthDate(uid: string, birth: Date): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    birthDate: Timestamp.fromDate(birth),
    isMinor: isMinorAt(birth),
  })
}

// Adults confirm for themselves; minors get consent from a parent (Cloud Function).
export async function giveAdultConsent(uid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { consentBy: 'self', consentAt: serverTimestamp() })
}

export function isOnboardingComplete(profile: Profile): boolean {
  if (profile.role !== 'student') return true
  const basics = Boolean(profile.name && profile.birthDate && profile.instrument && profile.level)
  return basics && (profile.isMinor === true || Boolean(profile.consentAt))
}
