import { readFileSync } from 'node:fs'
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, setDoc, Timestamp } from 'firebase/firestore'

export const PROJECT_ID = 'ettunley-61749'

// Fixed people used by every test.
export const ids = {
  admin: 'admin',
  teacherA: 'teacherA', // approved
  teacherB: 'teacherB', // approved, has other students
  teacherPending: 'teacherPending',
  teacherRejected: 'teacherRejected',
  adultA: 'adultA', // adult student of teacherA, consent given
  minorA: 'minorA', // minor student of teacherA, parent approved
  minorNoConsent: 'minorNoConsent', // minor student of teacherA, waiting for parent
  studentB: 'studentB', // student of teacherB
  unlinked: 'unlinked', // adult student without a teacher
  pendingStudent: 'pendingStudent', // typed teacherA's code, not yet confirmed
  removedStudent: 'removedStudent', // was removed by teacherA; old assignment remains
}

export async function createEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    // Storage rules are deliberately not passed here: the emulator loads
    // storage.rules itself (from firebase.json), which is the only way its
    // rules can read user profiles from Firestore.
  })
}

const now = () => Timestamp.now()

function teacher(name: string, status: string) {
  return { role: 'teacher', name, createdAt: now(), teacherStatus: status }
}

function student(name: string, extra: Record<string, unknown>) {
  return {
    role: 'student',
    name,
    createdAt: now(),
    instrument: 'piano',
    level: 'beginner',
    ...extra,
  }
}

const adultBirth = Timestamp.fromDate(new Date('1990-05-01'))
const minorBirth = Timestamp.fromDate(new Date(Date.now() - 10 * 365 * 86400000))

// Fills the database as it would look after normal use (bypasses the rules).
export async function seed(env: RulesTestEnvironment) {
  await env.clearFirestore()
  await env.clearStorage()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    const put = (path: string, data: object) => setDoc(doc(db, path), data)

    await put('users/teacherA', { ...teacher('מורה א', 'approved'), inviteCode: 'AAAAAA' })
    await put('users/teacherB', { ...teacher('מורה ב', 'approved'), inviteCode: 'BBBBBB' })
    await put('users/teacherPending', teacher('ממתינה', 'pending'))
    await put('users/teacherRejected', teacher('נדחה', 'rejected'))

    await put('users/adultA', student('בוגר א', {
      birthDate: adultBirth, isMinor: false, teacherId: 'teacherA', teacherName: 'מורה א', linkStatus: 'approved',
      consentBy: 'self', consentAt: now(),
    }))
    await put('users/minorA', student('קטין א', {
      birthDate: minorBirth, isMinor: true, teacherId: 'teacherA', teacherName: 'מורה א', linkStatus: 'approved',
      consentBy: 'parent', consentAt: now(),
    }))
    await put('users/minorNoConsent', student('קטין בלי אישור', {
      birthDate: minorBirth, isMinor: true, teacherId: 'teacherA', teacherName: 'מורה א', linkStatus: 'approved',
    }))
    await put('users/studentB', student('תלמיד ב', {
      birthDate: adultBirth, isMinor: false, teacherId: 'teacherB', teacherName: 'מורה ב', linkStatus: 'approved',
      consentBy: 'self', consentAt: now(),
    }))
    await put('users/pendingStudent', student('ממתין לאישור', {
      birthDate: adultBirth, isMinor: false, teacherId: 'teacherA', teacherName: 'מורה א',
      linkStatus: 'pending', consentBy: 'self', consentAt: now(),
    }))
    await put('users/removedStudent', student('הוסר', {
      birthDate: adultBirth, isMinor: false, consentBy: 'self', consentAt: now(),
    }))
    await put('users/unlinked', student('ללא מורה', {
      birthDate: adultBirth, isMinor: false, consentBy: 'self', consentAt: now(),
    }))

    await put('inviteCodes/AAAAAA', { teacherId: 'teacherA' })
    await put('parentConsents/pc1', {
      studentId: 'minorNoConsent', teacherId: 'teacherA', parentEmail: 'p@example.com',
      tokenHash: 'hash', sentAt: now(), expiresAt: now(),
    })

    // Assignments with one item each.
    for (const [aid, teacherId, studentId] of [
      ['a1', 'teacherA', 'adultA'],
      ['a2', 'teacherA', 'minorA'],
      ['a3', 'teacherA', 'minorNoConsent'],
      ['aB', 'teacherB', 'studentB'],
      ['aR', 'teacherA', 'removedStudent'], // left over from before the removal
    ]) {
      await put(`assignments/${aid}`, {
        teacherId, studentId, title: 'סולם', description: '', dailyGoalMinutes: 15,
        weekStart: now(), createdAt: now(),
      })
      await put(`assignments/${aid}/items/i1`, { position: 1, title: 'סולם דו', status: 'working' })
    }
    await put('assignments/a1/items/i1/comments/c1', {
      authorId: 'teacherA', text: 'כל הכבוד', createdAt: now(), readAt: null,
    })

    await put('assignments/aR/items/i1/comments/c1', {
      authorId: 'teacherA', text: 'ישן', createdAt: now(), readAt: null,
    })
    await put('practiceLogs/lR', {
      studentId: 'removedStudent', teacherId: 'teacherA', assignmentId: 'aR',
      minutes: 10, startedAt: now(), endedAt: now(),
    })
    await put('practiceLogs/l1', {
      studentId: 'adultA', teacherId: 'teacherA', assignmentId: 'a1',
      minutes: 10, startedAt: now(), endedAt: now(),
    })

    await put('templates/t1', {
      teacherId: 'teacherA', title: 'תבנית', description: '', dailyGoalMinutes: 15, createdAt: now(),
    })
    await put('templates/t1/items/ti1', { position: 1, title: 'סולם' })
  })
}
