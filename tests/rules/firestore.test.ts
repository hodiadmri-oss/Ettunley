import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { createEnv, ids, seed } from './helpers'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await createEnv()
})
afterAll(async () => {
  await env.cleanup()
})
beforeEach(async () => {
  await seed(env)
})

const as = (uid: string, claims: Record<string, unknown> = {}) =>
  env.authenticatedContext(uid, claims).firestore()
const anonymous = () => env.unauthenticatedContext().firestore()
const ts = (iso: string) => Timestamp.fromDate(new Date(iso))

describe('users - sign-up', () => {
  it('a new user can create a student profile for themselves', async () => {
    await assertSucceeds(
      setDoc(doc(as('newbie'), 'users/newbie'), {
        role: 'student', name: 'חדש', createdAt: serverTimestamp(),
      }),
    )
  })

  const googleTeacher = (uid: string) =>
    as(uid, { email_verified: true, firebase: { sign_in_provider: 'google.com' } })

  it('a new teacher always starts as pending', async () => {
    await assertSucceeds(
      setDoc(doc(googleTeacher('newT'), 'users/newT'), {
        role: 'teacher', name: 'מורה', createdAt: serverTimestamp(), teacherStatus: 'pending',
      }),
    )
  })

  it('a teacher cannot sign up with e-mail and password (Google only)', async () => {
    await assertFails(
      setDoc(
        doc(as('newT', { email_verified: true, firebase: { sign_in_provider: 'password' } }), 'users/newT'),
        { role: 'teacher', name: 'מורה', createdAt: serverTimestamp(), teacherStatus: 'pending' },
      ),
    )
  })

  it('a teacher needs a verified e-mail to sign up', async () => {
    await assertFails(
      setDoc(
        doc(as('newT', { email_verified: false, firebase: { sign_in_provider: 'google.com' } }), 'users/newT'),
        { role: 'teacher', name: 'מורה', createdAt: serverTimestamp(), teacherStatus: 'pending' },
      ),
    )
  })

  it('students may still sign up with e-mail and password', async () => {
    await assertSucceeds(
      setDoc(
        doc(as('newS', { firebase: { sign_in_provider: 'password' } }), 'users/newS'),
        { role: 'student', name: 'תלמיד', createdAt: serverTimestamp() },
      ),
    )
  })

  it('a new teacher cannot create themselves as approved', async () => {
    await assertFails(
      setDoc(doc(googleTeacher('newT'), 'users/newT'), {
        role: 'teacher', name: 'מורה', createdAt: serverTimestamp(), teacherStatus: 'approved',
      }),
    )
  })

  it('a new teacher cannot give themselves an invite code', async () => {
    await assertFails(
      setDoc(doc(googleTeacher('newT'), 'users/newT'), {
        role: 'teacher', name: 'מורה', createdAt: serverTimestamp(),
        teacherStatus: 'pending', inviteCode: 'ZZZZZZ',
      }),
    )
  })

  it('a student cannot create themselves already linked to a teacher', async () => {
    await assertFails(
      setDoc(doc(as('newbie'), 'users/newbie'), {
        role: 'student', name: 'חדש', createdAt: serverTimestamp(), teacherId: 'teacherA',
      }),
    )
    await assertFails(
      setDoc(doc(as('newbie'), 'users/newbie'), {
        role: 'student', name: 'חדש', createdAt: serverTimestamp(), teacherId: 'teacherA', linkStatus: 'approved',
      }),
    )
  })

  it('cannot create a profile for someone else', async () => {
    await assertFails(
      setDoc(doc(as('newbie'), 'users/someoneElse'), {
        role: 'student', name: 'x', createdAt: serverTimestamp(),
      }),
    )
  })

  it('cannot create an admin or any other role', async () => {
    await assertFails(
      setDoc(doc(as('newbie'), 'users/newbie'), {
        role: 'admin', name: 'x', createdAt: serverTimestamp(),
      }),
    )
  })

  it('anonymous users cannot create profiles', async () => {
    await assertFails(
      setDoc(doc(anonymous(), 'users/ghost'), {
        role: 'student', name: 'x', createdAt: serverTimestamp(),
      }),
    )
  })
})

describe('users - reading', () => {
  it('a user reads their own profile', async () => {
    await assertSucceeds(getDoc(doc(as(ids.adultA), 'users/adultA')))
  })

  it('a student cannot read another student', async () => {
    await assertFails(getDoc(doc(as(ids.adultA), 'users/studentB')))
  })

  it('a student cannot read a teacher profile (invite code stays private)', async () => {
    await assertFails(getDoc(doc(as(ids.adultA), 'users/teacherA')))
  })

  it('a teacher reads their own student', async () => {
    await assertSucceeds(getDoc(doc(as(ids.teacherA), 'users/minorA')))
  })

  it("a teacher lists only their own students", async () => {
    await assertSucceeds(
      getDocs(query(collection(as(ids.teacherA), 'users'), where('teacherId', '==', 'teacherA'))),
    )
  })

  it("a teacher cannot read another teacher's student", async () => {
    await assertFails(getDoc(doc(as(ids.teacherA), 'users/studentB')))
  })

  it('a teacher cannot list students of another teacher', async () => {
    await assertFails(
      getDocs(query(collection(as(ids.teacherA), 'users'), where('teacherId', '==', 'teacherB'))),
    )
  })

  it('a teacher cannot read an unlinked student', async () => {
    await assertFails(getDoc(doc(as(ids.teacherA), 'users/unlinked')))
  })

  it('a pending teacher cannot read any student', async () => {
    await assertFails(getDoc(doc(as(ids.teacherPending), 'users/adultA')))
  })

  it('a rejected teacher cannot read any student', async () => {
    await assertFails(getDoc(doc(as(ids.teacherRejected), 'users/adultA')))
  })

  it('a teacher cannot read another teacher', async () => {
    await assertFails(getDoc(doc(as(ids.teacherA), 'users/teacherB')))
  })

  it('an anonymous user reads nothing', async () => {
    await assertFails(getDoc(doc(anonymous(), 'users/adultA')))
  })
})

describe('users - admin', () => {
  const admin = () => as(ids.admin, { admin: true, email_verified: true })

  it('the admin lists pending teachers', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(admin(), 'users'),
          where('role', '==', 'teacher'),
          where('teacherStatus', '==', 'pending'),
        ),
      ),
    )
  })

  it('the admin lists approved teachers', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(admin(), 'users'),
          where('role', '==', 'teacher'),
          where('teacherStatus', '==', 'approved'),
        ),
      ),
    )
  })

  it('the admin cannot read students (children data stays private)', async () => {
    await assertFails(getDoc(doc(admin(), 'users/minorA')))
  })

  it('the admin cannot list all users', async () => {
    await assertFails(getDocs(collection(admin(), 'users')))
  })

  it('a non-admin cannot list pending teachers', async () => {
    await assertFails(
      getDocs(
        query(
          collection(as(ids.teacherA), 'users'),
          where('role', '==', 'teacher'),
          where('teacherStatus', '==', 'pending'),
        ),
      ),
    )
  })

  it('a non-admin student cannot list pending teachers', async () => {
    await assertFails(
      getDocs(
        query(
          collection(as(ids.adultA), 'users'),
          where('role', '==', 'teacher'),
          where('teacherStatus', '==', 'pending'),
        ),
      ),
    )
  })

  it('a non-admin cannot approve a teacher (not even themselves)', async () => {
    await assertFails(updateDoc(doc(as(ids.teacherPending), 'users/teacherPending'), { teacherStatus: 'approved' }))
  })

  it('a non-admin cannot approve another teacher', async () => {
    await assertFails(updateDoc(doc(as(ids.teacherA), 'users/teacherPending'), { teacherStatus: 'approved' }))
  })

  it('even the admin cannot approve from the client (only Cloud Functions can)', async () => {
    await assertFails(updateDoc(doc(admin(), 'users/teacherPending'), { teacherStatus: 'approved' }))
  })

  it('a rejected teacher cannot re-approve themselves', async () => {
    await assertFails(updateDoc(doc(as(ids.teacherRejected), 'users/teacherRejected'), { teacherStatus: 'approved' }))
  })
})

describe('users - profile updates', () => {
  it('a teacher can change their own name', async () => {
    await assertSucceeds(updateDoc(doc(as(ids.teacherA), 'users/teacherA'), { name: 'שם חדש' }))
  })

  it('a teacher cannot change their invite code', async () => {
    await assertFails(updateDoc(doc(as(ids.teacherA), 'users/teacherA'), { inviteCode: 'HACKED' }))
  })

  it('a teacher cannot change their role', async () => {
    await assertFails(updateDoc(doc(as(ids.teacherA), 'users/teacherA'), { role: 'student' }))
  })

  it('a student cannot change their role', async () => {
    await assertFails(updateDoc(doc(as(ids.adultA), 'users/adultA'), { role: 'teacher' }))
  })

  it('a student can change instrument, level and name', async () => {
    await assertSucceeds(
      updateDoc(doc(as(ids.adultA), 'users/adultA'), {
        name: 'שם', instrument: 'guitar', level: 'advanced',
      }),
    )
  })

  it('a student cannot use an invalid level', async () => {
    await assertFails(updateDoc(doc(as(ids.adultA), 'users/adultA'), { level: 'god' }))
  })

  it('a student cannot change their teacher', async () => {
    await assertFails(updateDoc(doc(as(ids.adultA), 'users/adultA'), { teacherId: 'teacherB' }))
  })

  it('a student cannot link themselves to a teacher without the invite-code function', async () => {
    await assertFails(updateDoc(doc(as(ids.unlinked), 'users/unlinked'), { teacherId: 'teacherA' }))
  })

  it('a student cannot change the teacher name shown on their profile', async () => {
    await assertFails(updateDoc(doc(as(ids.adultA), 'users/adultA'), { teacherName: 'מישהו אחר' }))
  })

  it('a student cannot flip isMinor after it was set', async () => {
    await assertFails(updateDoc(doc(as(ids.minorA), 'users/minorA'), { isMinor: false }))
  })

  it('a minor cannot change their date of birth to look like an adult', async () => {
    await assertFails(
      updateDoc(doc(as(ids.minorNoConsent), 'users/minorNoConsent'), {
        birthDate: ts('1990-01-01'),
      }),
    )
  })

  it('a minor cannot give consent for themselves', async () => {
    await assertFails(
      updateDoc(doc(as(ids.minorNoConsent), 'users/minorNoConsent'), {
        consentBy: 'self', consentAt: serverTimestamp(),
      }),
    )
  })

  it('a minor cannot fake parent consent', async () => {
    await assertFails(
      updateDoc(doc(as(ids.minorNoConsent), 'users/minorNoConsent'), {
        consentBy: 'parent', consentAt: serverTimestamp(),
      }),
    )
  })

  it("a student cannot edit another student's profile", async () => {
    await assertFails(updateDoc(doc(as(ids.adultA), 'users/studentB'), { name: 'x' }))
  })

  it('a teacher cannot edit a student profile', async () => {
    await assertFails(updateDoc(doc(as(ids.teacherA), 'users/adultA'), { name: 'x' }))
  })

  it('nobody can delete a user profile', async () => {
    await assertFails(deleteDoc(doc(as(ids.adultA), 'users/adultA')))
  })
})

describe('users - student onboarding', () => {
  const freshStudent = async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/fresh'), {
        role: 'student', name: 'חדש', createdAt: Timestamp.now(),
      })
    })
    return as('fresh')
  }

  it('an adult sets date of birth together with isMinor=false, then consents', async () => {
    const db = await freshStudent()
    await assertSucceeds(
      updateDoc(doc(db, 'users/fresh'), { birthDate: ts('1985-03-03'), isMinor: false }),
    )
    await assertSucceeds(
      updateDoc(doc(db, 'users/fresh'), { consentBy: 'self', consentAt: serverTimestamp() }),
    )
  })

  it('a child is recorded as a minor', async () => {
    const db = await freshStudent()
    const tenYearsAgo = Timestamp.fromDate(new Date(Date.now() - 10 * 365 * 86400000))
    await assertSucceeds(updateDoc(doc(db, 'users/fresh'), { birthDate: tenYearsAgo, isMinor: true }))
  })

  it('isMinor must match the date of birth (no claiming to be an adult)', async () => {
    const db = await freshStudent()
    const tenYearsAgo = Timestamp.fromDate(new Date(Date.now() - 10 * 365 * 86400000))
    await assertFails(updateDoc(doc(db, 'users/fresh'), { birthDate: tenYearsAgo, isMinor: false }))
  })

  it('a birth date in the future is rejected', async () => {
    const db = await freshStudent()
    await assertFails(
      updateDoc(doc(db, 'users/fresh'), { birthDate: ts('2999-01-01'), isMinor: true }),
    )
  })

  it('date of birth cannot be written without isMinor', async () => {
    const db = await freshStudent()
    await assertFails(updateDoc(doc(db, 'users/fresh'), { birthDate: ts('1985-03-03') }))
  })

  it('an adult cannot consent before the date of birth is known', async () => {
    const db = await freshStudent()
    await assertFails(
      updateDoc(doc(db, 'users/fresh'), { consentBy: 'self', consentAt: serverTimestamp() }),
    )
  })

  it('consent timestamp must be the server time', async () => {
    const db = await freshStudent()
    await assertSucceeds(
      updateDoc(doc(db, 'users/fresh'), { birthDate: ts('1985-03-03'), isMinor: false }),
    )
    await assertFails(
      updateDoc(doc(db, 'users/fresh'), { consentBy: 'self', consentAt: ts('2020-01-01') }),
    )
  })
})

describe('inviteCodes and parentConsents', () => {
  it('nobody can read an invite code', async () => {
    await assertFails(getDoc(doc(as(ids.teacherA), 'inviteCodes/AAAAAA')))
    await assertFails(getDoc(doc(as(ids.adultA), 'inviteCodes/AAAAAA')))
    await assertFails(getDoc(doc(as(ids.admin, { admin: true, email_verified: true }), 'inviteCodes/AAAAAA')))
  })

  it('nobody can list invite codes', async () => {
    await assertFails(getDocs(collection(as(ids.teacherA), 'inviteCodes')))
  })

  it('nobody can write an invite code', async () => {
    await assertFails(setDoc(doc(as(ids.teacherA), 'inviteCodes/NEWCODE'), { teacherId: 'teacherA' }))
  })

  it("a teacher reads the consent status of their own student", async () => {
    await assertSucceeds(getDoc(doc(as(ids.teacherA), 'parentConsents/pc1')))
  })

  it("another teacher cannot read someone else's parent consent", async () => {
    await assertFails(getDoc(doc(as(ids.teacherB), 'parentConsents/pc1')))
  })

  it('a pending teacher cannot read parent consents', async () => {
    await assertFails(getDoc(doc(as(ids.teacherPending), 'parentConsents/pc1')))
  })

  it('the student cannot read the parent email or consent', async () => {
    await assertFails(getDoc(doc(as(ids.minorNoConsent), 'parentConsents/pc1')))
  })

  it('a teacher cannot write a parent consent (not even approve it)', async () => {
    await assertFails(updateDoc(doc(as(ids.teacherA), 'parentConsents/pc1'), { approvedAt: serverTimestamp() }))
    await assertFails(
      setDoc(doc(as(ids.teacherA), 'parentConsents/pc2'), { studentId: 'minorA', teacherId: 'teacherA' }),
    )
  })

  it('a student cannot approve their own parent consent', async () => {
    await assertFails(updateDoc(doc(as(ids.minorNoConsent), 'parentConsents/pc1'), { approvedAt: serverTimestamp() }))
  })
})

describe('assignments', () => {
  const newAssignment = (studentId: string, teacherId = 'teacherA') => ({
    teacherId, studentId, title: 'פרק חדש', description: 'לתרגל לאט', dailyGoalMinutes: 20,
    weekStart: ts('2026-10-11'), createdAt: serverTimestamp(),
  })

  it('an approved teacher creates an assignment for their own student', async () => {
    await assertSucceeds(setDoc(doc(as(ids.teacherA), 'assignments/new'), newAssignment('adultA')))
  })

  it("a teacher cannot create an assignment for another teacher's student", async () => {
    await assertFails(setDoc(doc(as(ids.teacherA), 'assignments/new'), newAssignment('studentB')))
  })

  it('a teacher cannot create an assignment for an unlinked student', async () => {
    await assertFails(setDoc(doc(as(ids.teacherA), 'assignments/new'), newAssignment('unlinked')))
  })

  it('a teacher cannot create an assignment in the name of another teacher', async () => {
    await assertFails(setDoc(doc(as(ids.teacherA), 'assignments/new'), newAssignment('studentB', 'teacherB')))
  })

  it('a pending teacher cannot create assignments', async () => {
    await assertFails(
      setDoc(doc(as(ids.teacherPending), 'assignments/new'), newAssignment('adultA', 'teacherPending')),
    )
  })

  it('a rejected teacher cannot create assignments', async () => {
    await assertFails(
      setDoc(doc(as(ids.teacherRejected), 'assignments/new'), newAssignment('adultA', 'teacherRejected')),
    )
  })

  it('a student cannot create an assignment', async () => {
    await assertFails(setDoc(doc(as(ids.adultA), 'assignments/new'), newAssignment('adultA')))
  })

  it('rejects an assignment with a missing title or absurd goal', async () => {
    await assertFails(
      setDoc(doc(as(ids.teacherA), 'assignments/bad1'), { ...newAssignment('adultA'), title: '' }),
    )
    await assertFails(
      setDoc(doc(as(ids.teacherA), 'assignments/bad2'), { ...newAssignment('adultA'), dailyGoalMinutes: 9999 }),
    )
  })

  it('the student reads their own assignment', async () => {
    await assertSucceeds(getDoc(doc(as(ids.adultA), 'assignments/a1')))
  })

  it("the student lists their own assignments", async () => {
    await assertSucceeds(
      getDocs(query(collection(as(ids.adultA), 'assignments'), where('studentId', '==', 'adultA'))),
    )
  })

  it("a student cannot read another student's assignment", async () => {
    await assertFails(getDoc(doc(as(ids.adultA), 'assignments/aB')))
    await assertFails(getDoc(doc(as(ids.adultA), 'assignments/a2')))
  })

  it('a student cannot list assignments of another student', async () => {
    await assertFails(
      getDocs(query(collection(as(ids.adultA), 'assignments'), where('studentId', '==', 'studentB'))),
    )
  })

  it('an unlinked student reads nothing', async () => {
    await assertFails(getDoc(doc(as(ids.unlinked), 'assignments/a1')))
  })

  it('the teacher reads and lists their own assignments', async () => {
    await assertSucceeds(getDoc(doc(as(ids.teacherA), 'assignments/a1')))
    // The teacher always asks about one student at a time.
    await assertSucceeds(
      getDocs(
        query(
          collection(as(ids.teacherA), 'assignments'),
          where('teacherId', '==', 'teacherA'),
          where('studentId', '==', 'adultA'),
        ),
      ),
    )
    await assertFails(
      getDocs(query(collection(as(ids.teacherA), 'assignments'), where('teacherId', '==', 'teacherA'))),
    )
  })

  it("another teacher cannot read or edit someone else's assignment", async () => {
    await assertFails(getDoc(doc(as(ids.teacherB), 'assignments/a1')))
    await assertFails(updateDoc(doc(as(ids.teacherB), 'assignments/a1'), { title: 'x' }))
  })

  it('the teacher edits title, description and goal', async () => {
    await assertSucceeds(
      updateDoc(doc(as(ids.teacherA), 'assignments/a1'), { title: 'ערוך', dailyGoalMinutes: 25 }),
    )
  })

  it('the teacher cannot move the assignment to another student or teacher', async () => {
    await assertFails(updateDoc(doc(as(ids.teacherA), 'assignments/a1'), { studentId: 'studentB' }))
    await assertFails(updateDoc(doc(as(ids.teacherA), 'assignments/a1'), { teacherId: 'teacherB' }))
  })

  it('a student cannot edit an assignment', async () => {
    await assertFails(updateDoc(doc(as(ids.adultA), 'assignments/a1'), { dailyGoalMinutes: 1 }))
  })

  it('nobody can delete an assignment', async () => {
    await assertFails(deleteDoc(doc(as(ids.teacherA), 'assignments/a1')))
    await assertFails(deleteDoc(doc(as(ids.adultA), 'assignments/a1')))
  })
})

describe('assignment items', () => {
  const item = { position: 2, title: 'אטיוד', status: 'working', metronomeBpm: 80 }

  it('the teacher creates an item with all optional parts', async () => {
    await assertSucceeds(
      setDoc(doc(as(ids.teacherA), 'assignments/a1/items/i2'), {
        ...item,
        sheetPath: 'sheet-music/teacherA/etude.pdf',
        accompanimentPath: 'sheet-music/teacherA/backing.mp3',
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      }),
    )
  })

  it("the teacher cannot point an item at another teacher's file", async () => {
    await assertFails(
      setDoc(doc(as(ids.teacherA), 'assignments/a1/items/i2'), {
        ...item, sheetPath: 'sheet-music/teacherB/secret.pdf',
      }),
    )
  })

  it('a teacher cannot create an item with a ready status or a recording', async () => {
    await assertFails(setDoc(doc(as(ids.teacherA), 'assignments/a1/items/i2'), { ...item, status: 'ready' }))
    await assertFails(
      setDoc(doc(as(ids.teacherA), 'assignments/a1/items/i2'), {
        ...item, recording: { path: 'x', durationSeconds: 1, uploadedAt: serverTimestamp() },
      }),
    )
  })

  it("the teacher's practice tips (notes) are accepted, but not too long or not text", async () => {
    await assertSucceeds(setDoc(doc(as(ids.teacherA), 'assignments/a1/items/i2'), { ...item, notes: 'לנגן לאט, עם מטרונום' }))
    await assertFails(setDoc(doc(as(ids.teacherA), 'assignments/a1/items/i3'), { ...item, notes: 'א'.repeat(1001) }))
    await assertFails(setDoc(doc(as(ids.teacherA), 'assignments/a1/items/i3'), { ...item, notes: 5 }))
  })

  it('a student can read the notes but cannot change them', async () => {
    await assertSucceeds(setDoc(doc(as(ids.teacherA), 'assignments/a1/items/i2'), { ...item, notes: 'טיפ' }))
    await assertSucceeds(getDoc(doc(as(ids.adultA), 'assignments/a1/items/i2')))
    await assertFails(updateDoc(doc(as(ids.adultA), 'assignments/a1/items/i2'), { notes: 'שינוי' }))
  })

  it('an item position is limited to 10 items per assignment', async () => {
    await assertSucceeds(setDoc(doc(as(ids.teacherA), 'assignments/a1/items/i9'), { ...item, position: 9 }))
    await assertFails(setDoc(doc(as(ids.teacherA), 'assignments/a1/items/i10'), { ...item, position: 10 }))
    await assertFails(setDoc(doc(as(ids.teacherA), 'assignments/a1/items/ineg'), { ...item, position: -1 }))
  })

  it('a metronome outside a sensible range is rejected', async () => {
    await assertFails(setDoc(doc(as(ids.teacherA), 'assignments/a1/items/i2'), { ...item, metronomeBpm: 5000 }))
  })

  it("another teacher cannot add items to someone else's assignment", async () => {
    await assertFails(setDoc(doc(as(ids.teacherB), 'assignments/a1/items/i2'), item))
  })

  it('a pending teacher cannot add items', async () => {
    await assertFails(setDoc(doc(as(ids.teacherPending), 'assignments/a1/items/i2'), item))
  })

  it('a student cannot create an item', async () => {
    await assertFails(setDoc(doc(as(ids.adultA), 'assignments/a1/items/i2'), item))
  })

  it('the student and the teacher read the item; others cannot', async () => {
    await assertSucceeds(getDoc(doc(as(ids.adultA), 'assignments/a1/items/i1')))
    await assertSucceeds(getDoc(doc(as(ids.teacherA), 'assignments/a1/items/i1')))
    await assertFails(getDoc(doc(as(ids.studentB), 'assignments/a1/items/i1')))
    await assertFails(getDoc(doc(as(ids.teacherB), 'assignments/a1/items/i1')))
    await assertFails(getDoc(doc(as(ids.unlinked), 'assignments/a1/items/i1')))
  })

  it('the teacher edits item content', async () => {
    await assertSucceeds(updateDoc(doc(as(ids.teacherA), 'assignments/a1/items/i1'), { title: 'חדש' }))
  })

  it("the teacher cannot change the student's status or recording", async () => {
    await assertFails(
      updateDoc(doc(as(ids.teacherA), 'assignments/a1/items/i1'), {
        status: 'ready', statusUpdatedAt: serverTimestamp(),
      }),
    )
    await assertFails(
      updateDoc(doc(as(ids.teacherA), 'assignments/a1/items/i1'), {
        recording: { path: 'x', durationSeconds: 10, uploadedAt: serverTimestamp() },
      }),
    )
  })

  it('the student marks an item as ready and back', async () => {
    const db = as(ids.adultA)
    await assertSucceeds(
      updateDoc(doc(db, 'assignments/a1/items/i1'), { status: 'ready', statusUpdatedAt: serverTimestamp() }),
    )
    await assertSucceeds(
      updateDoc(doc(db, 'assignments/a1/items/i1'), { status: 'working', statusUpdatedAt: serverTimestamp() }),
    )
  })

  it('a status change needs a server timestamp and a valid value', async () => {
    const db = as(ids.adultA)
    await assertFails(updateDoc(doc(db, 'assignments/a1/items/i1'), { status: 'ready' }))
    await assertFails(
      updateDoc(doc(db, 'assignments/a1/items/i1'), { status: 'done', statusUpdatedAt: serverTimestamp() }),
    )
  })

  it("a student cannot change the item's content", async () => {
    await assertFails(updateDoc(doc(as(ids.adultA), 'assignments/a1/items/i1'), { title: 'x' }))
    await assertFails(updateDoc(doc(as(ids.adultA), 'assignments/a1/items/i1'), { metronomeBpm: 200 }))
  })

  it("a student cannot change the status of another student's item", async () => {
    await assertFails(
      updateDoc(doc(as(ids.adultA), 'assignments/aB/items/i1'), {
        status: 'ready', statusUpdatedAt: serverTimestamp(),
      }),
    )
  })

  it('a teacher cannot delete an item that already has a recording', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'assignments/a1/items/i1'), {
        recording: { path: 'recordings/adultA/a1/i1', durationSeconds: 30, uploadedAt: Timestamp.now() },
      })
    })
    await assertFails(deleteDoc(doc(as(ids.teacherA), 'assignments/a1/items/i1')))
  })

  it('a teacher can delete an item without a recording; a student cannot', async () => {
    await assertFails(deleteDoc(doc(as(ids.adultA), 'assignments/a1/items/i1')))
    await assertSucceeds(deleteDoc(doc(as(ids.teacherA), 'assignments/a1/items/i1')))
  })
})

describe('recordings (item.recording)', () => {
  const recording = (uid: string, aid: string, seconds = 120) => ({
    recording: {
      path: `recordings/${uid}/${aid}/i1`,
      durationSeconds: seconds,
      uploadedAt: serverTimestamp(),
    },
  })

  it('an adult with consent attaches a recording', async () => {
    await assertSucceeds(updateDoc(doc(as(ids.adultA), 'assignments/a1/items/i1'), recording('adultA', 'a1')))
  })

  it('a minor with parent consent attaches a recording', async () => {
    await assertSucceeds(updateDoc(doc(as(ids.minorA), 'assignments/a2/items/i1'), recording('minorA', 'a2')))
  })

  it('a minor WITHOUT parent consent cannot attach a recording', async () => {
    await assertFails(
      updateDoc(doc(as(ids.minorNoConsent), 'assignments/a3/items/i1'), recording('minorNoConsent', 'a3')),
    )
  })

  it('a minor without consent can still change item status (practice is allowed)', async () => {
    await assertSucceeds(
      updateDoc(doc(as(ids.minorNoConsent), 'assignments/a3/items/i1'), {
        status: 'ready', statusUpdatedAt: serverTimestamp(),
      }),
    )
  })

  it('a recording longer than 3 minutes is rejected', async () => {
    await assertFails(updateDoc(doc(as(ids.adultA), 'assignments/a1/items/i1'), recording('adultA', 'a1', 181)))
  })

  it('exactly 3 minutes is accepted', async () => {
    await assertSucceeds(updateDoc(doc(as(ids.adultA), 'assignments/a1/items/i1'), recording('adultA', 'a1', 180)))
  })

  it('the recording path must point at the student own folder', async () => {
    await assertFails(
      updateDoc(doc(as(ids.adultA), 'assignments/a1/items/i1'), {
        recording: { path: 'recordings/studentB/aB/i1', durationSeconds: 30, uploadedAt: serverTimestamp() },
      }),
    )
  })

  it('a student without consent fields at all cannot record', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/noConsentField'), {
        role: 'student', name: 'x', createdAt: Timestamp.now(), teacherId: 'teacherA',
      })
      await setDoc(doc(ctx.firestore(), 'assignments/aX'), {
        teacherId: 'teacherA', studentId: 'noConsentField', title: 't', dailyGoalMinutes: 10,
        weekStart: Timestamp.now(), createdAt: Timestamp.now(),
      })
      await setDoc(doc(ctx.firestore(), 'assignments/aX/items/i1'), { position: 1, title: 'x', status: 'working' })
    })
    await assertFails(
      updateDoc(doc(as('noConsentField'), 'assignments/aX/items/i1'), recording('noConsentField', 'aX')),
    )
  })
})

describe('"I listened" and recording alerts', () => {
  const withRecording = () =>
    env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'assignments/a1/items/i1'), {
        recording: { path: 'recordings/adultA/a1/i1', durationSeconds: 30, uploadedAt: Timestamp.now() },
      })
    })

  it('the teacher marks a recording as heard, with the server time', async () => {
    await withRecording()
    await assertSucceeds(updateDoc(doc(as(ids.teacherA), 'assignments/a1/items/i1'), { recordingSeenAt: serverTimestamp() }))
  })

  it('the time cannot be chosen, and nothing else can ride along', async () => {
    await withRecording()
    await assertFails(updateDoc(doc(as(ids.teacherA), 'assignments/a1/items/i1'), { recordingSeenAt: Timestamp.fromMillis(Date.now() + 86400000) }))
    await assertFails(updateDoc(doc(as(ids.teacherA), 'assignments/a1/items/i1'), { recordingSeenAt: serverTimestamp(), title: 'x' }))
    await assertFails(updateDoc(doc(as(ids.teacherA), 'assignments/a1/items/i1'), { recordingSeenAt: serverTimestamp(), status: 'ready' }))
  })

  it('only the teacher of that student, and only for an item that has a recording', async () => {
    await assertFails(updateDoc(doc(as(ids.teacherA), 'assignments/a1/items/i1'), { recordingSeenAt: serverTimestamp() }))
    await withRecording()
    await assertFails(updateDoc(doc(as(ids.teacherB), 'assignments/a1/items/i1'), { recordingSeenAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(as(ids.adultA), 'assignments/a1/items/i1'), { recordingSeenAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(as(ids.teacherPending), 'assignments/a1/items/i1'), { recordingSeenAt: serverTimestamp() }))
  })

  it('a removed student cannot be listened to any more', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'assignments/aR/items/i1'), {
        recording: { path: 'recordings/removedStudent/aR/i1', durationSeconds: 30, uploadedAt: Timestamp.now() },
      })
    })
    await assertFails(updateDoc(doc(as(ids.teacherA), 'assignments/aR/items/i1'), { recordingSeenAt: serverTimestamp() }))
  })

  describe('recordingAlerts', () => {
    beforeEach(async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'recordingAlerts/a1_i1'), {
          teacherId: 'teacherA', studentId: 'adultA', assignmentId: 'a1', itemId: 'i1',
          assignmentTitle: 'מטלה', itemTitle: 'פריט', uploadedAt: Timestamp.now(),
        })
      })
    })

    it('the teacher lists her own alerts', async () => {
      await assertSucceeds(getDocs(query(collection(as(ids.teacherA), 'recordingAlerts'), where('teacherId', '==', 'teacherA'))))
      await assertSucceeds(getDoc(doc(as(ids.teacherA), 'recordingAlerts/a1_i1')))
    })

    it('nobody else reads them: another teacher, a student, a pending teacher', async () => {
      await assertFails(getDoc(doc(as(ids.teacherB), 'recordingAlerts/a1_i1')))
      await assertFails(getDoc(doc(as(ids.adultA), 'recordingAlerts/a1_i1')))
      await assertFails(getDoc(doc(as(ids.teacherPending), 'recordingAlerts/a1_i1')))
      await assertFails(getDocs(query(collection(as(ids.teacherB), 'recordingAlerts'), where('teacherId', '==', 'teacherA'))))
      await assertFails(getDocs(collection(as(ids.teacherA), 'recordingAlerts')))
    })

    it('only a Function writes or deletes them', async () => {
      await assertFails(setDoc(doc(as(ids.teacherA), 'recordingAlerts/new'), { teacherId: 'teacherA' }))
      await assertFails(deleteDoc(doc(as(ids.teacherA), 'recordingAlerts/a1_i1')))
      await assertFails(deleteDoc(doc(as(ids.adultA), 'recordingAlerts/a1_i1')))
    })
  })

  it('a student cannot write the practice summary or the alert fields on their own profile', async () => {
    await assertFails(updateDoc(doc(as(ids.adultA), 'users/adultA'), { practiceDays: { '2026-10-29': 99999 } }))
    await assertFails(updateDoc(doc(as(ids.adultA), 'users/adultA'), { waitingRecordings: 5 }))
  })
})

describe('comments (teacher replies)', () => {
  const newComment = (author = 'teacherA') => ({
    authorId: author, text: 'יפה מאוד, תשימי לב לקצב', createdAt: serverTimestamp(), readAt: null,
  })
  const path = 'assignments/a1/items/i1/comments'

  it('the teacher replies', async () => {
    await assertSucceeds(setDoc(doc(as(ids.teacherA), `${path}/c2`), newComment()))
  })

  it("the teacher cannot post under someone else's name", async () => {
    await assertFails(setDoc(doc(as(ids.teacherA), `${path}/c2`), newComment('teacherB')))
  })

  it('a reply cannot be created already marked as read, or empty, or huge', async () => {
    await assertFails(setDoc(doc(as(ids.teacherA), `${path}/c2`), { ...newComment(), readAt: serverTimestamp() }))
    await assertFails(setDoc(doc(as(ids.teacherA), `${path}/c2`), { ...newComment(), text: '' }))
    await assertFails(setDoc(doc(as(ids.teacherA), `${path}/c2`), { ...newComment(), text: 'x'.repeat(501) }))
  })

  it("another teacher cannot reply on someone else's student", async () => {
    await assertFails(setDoc(doc(as(ids.teacherB), `${path}/c2`), newComment('teacherB')))
  })

  it('a pending teacher cannot reply', async () => {
    await assertFails(setDoc(doc(as(ids.teacherPending), `${path}/c2`), newComment('teacherPending')))
  })

  it('a student cannot write a comment', async () => {
    await assertFails(setDoc(doc(as(ids.adultA), `${path}/c2`), newComment('adultA')))
  })

  it('the student and the teacher read replies; strangers cannot', async () => {
    await assertSucceeds(getDoc(doc(as(ids.adultA), `${path}/c1`)))
    await assertSucceeds(getDoc(doc(as(ids.teacherA), `${path}/c1`)))
    await assertFails(getDoc(doc(as(ids.studentB), `${path}/c1`)))
    await assertFails(getDoc(doc(as(ids.teacherB), `${path}/c1`)))
  })

  it('the student marks a reply as read, exactly once', async () => {
    const ref = doc(as(ids.adultA), `${path}/c1`)
    await assertSucceeds(updateDoc(ref, { readAt: serverTimestamp() }))
    await assertFails(updateDoc(ref, { readAt: serverTimestamp() }))
  })

  it('the student cannot edit the text of a reply', async () => {
    await assertFails(updateDoc(doc(as(ids.adultA), `${path}/c1`), { text: 'שיניתי' }))
  })

  it('another student cannot mark it as read', async () => {
    await assertFails(updateDoc(doc(as(ids.studentB), `${path}/c1`), { readAt: serverTimestamp() }))
  })

  it('the teacher edits own reply text but not the read mark', async () => {
    await assertSucceeds(updateDoc(doc(as(ids.teacherA), `${path}/c1`), { text: 'תיקון' }))
    await assertFails(updateDoc(doc(as(ids.teacherA), `${path}/c1`), { readAt: serverTimestamp() }))
  })

  it('nobody deletes replies', async () => {
    await assertFails(deleteDoc(doc(as(ids.teacherA), `${path}/c1`)))
    await assertFails(deleteDoc(doc(as(ids.adultA), `${path}/c1`)))
  })
})

describe('practiceLogs', () => {
  const log = (over: Record<string, unknown> = {}) => ({
    studentId: 'adultA', teacherId: 'teacherA', assignmentId: 'a1',
    seconds: 720, startedAt: Timestamp.fromMillis(Date.now() - 13 * 60000),
    endedAt: Timestamp.fromMillis(Date.now() - 60000), ...over,
  })

  it('a student logs their own practice', async () => {
    await assertSucceeds(setDoc(doc(as(ids.adultA), 'practiceLogs/new'), log()))
  })

  it('a minor without consent can still log practice', async () => {
    await assertSucceeds(
      setDoc(
        doc(as(ids.minorNoConsent), 'practiceLogs/new'),
        log({ studentId: 'minorNoConsent', assignmentId: 'a3' }),
      ),
    )
  })

  it('cannot log for another student', async () => {
    await assertFails(setDoc(doc(as(ids.adultA), 'practiceLogs/new'), log({ studentId: 'studentB' })))
  })

  it("cannot log on someone else's assignment", async () => {
    await assertFails(setDoc(doc(as(ids.adultA), 'practiceLogs/new'), log({ assignmentId: 'aB' })))
  })

  it('cannot attach the log to a different teacher', async () => {
    await assertFails(setDoc(doc(as(ids.adultA), 'practiceLogs/new'), log({ teacherId: 'teacherB' })))
  })

  it('rejects a mis-tap (under 10 seconds) and absurd lengths, but accepts short practice', async () => {
    const short = (seconds: number) => ({ seconds, startedAt: Timestamp.fromMillis(Date.now() - 60000), endedAt: Timestamp.now() })
    await assertFails(setDoc(doc(as(ids.adultA), 'practiceLogs/new'), log(short(0))))
    await assertFails(setDoc(doc(as(ids.adultA), 'practiceLogs/new'), log(short(9))))
    await assertSucceeds(setDoc(doc(as(ids.adultA), 'practiceLogs/new'), log(short(10))))
    await assertSucceeds(setDoc(doc(as(ids.adultA), 'practiceLogs/new2'), log(short(40))))
    await assertFails(setDoc(doc(as(ids.adultA), 'practiceLogs/new3'), log({ seconds: 36001 })))
    await assertFails(setDoc(doc(as(ids.adultA), 'practiceLogs/new4'), log({ seconds: 12.5 })))
    await assertFails(setDoc(doc(as(ids.adultA), 'practiceLogs/new5'), { ...log(), minutes: 5 }))
  })

  it('an unlinked student cannot log practice', async () => {
    await assertFails(
      setDoc(doc(as(ids.unlinked), 'practiceLogs/new'), log({ studentId: 'unlinked', teacherId: 'teacherA' })),
    )
  })

  it('a teacher cannot create logs', async () => {
    await assertFails(setDoc(doc(as(ids.teacherA), 'practiceLogs/new'), log()))
  })

  it('the student and the teacher read the logs; others cannot', async () => {
    await assertSucceeds(getDoc(doc(as(ids.adultA), 'practiceLogs/l1')))
    await assertSucceeds(getDoc(doc(as(ids.teacherA), 'practiceLogs/l1')))
    await assertFails(getDoc(doc(as(ids.studentB), 'practiceLogs/l1')))
    await assertFails(getDoc(doc(as(ids.teacherB), 'practiceLogs/l1')))
  })

  it('a teacher lists only their own logs', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(as(ids.teacherA), 'practiceLogs'),
          where('teacherId', '==', 'teacherA'),
          where('studentId', '==', 'adultA'),
        ),
      ),
    )
    await assertFails(
      getDocs(
        query(
          collection(as(ids.teacherA), 'practiceLogs'),
          where('teacherId', '==', 'teacherB'),
          where('studentId', '==', 'adultA'),
        ),
      ),
    )
    await assertFails(
      getDocs(query(collection(as(ids.teacherA), 'practiceLogs'), where('teacherId', '==', 'teacherA'))),
    )
  })

  it('logs cannot be edited or deleted', async () => {
    await assertFails(updateDoc(doc(as(ids.adultA), 'practiceLogs/l1'), { seconds: 3600 }))
    await assertFails(deleteDoc(doc(as(ids.adultA), 'practiceLogs/l1')))
  })
})

describe('templates', () => {
  const newTemplate = (teacherId = 'teacherA') => ({
    teacherId, title: 'תבנית חדשה', description: '', dailyGoalMinutes: 20, createdAt: serverTimestamp(),
  })

  it('an approved teacher creates, reads, edits and deletes their template', async () => {
    const db = as(ids.teacherA)
    await assertSucceeds(setDoc(doc(db, 'templates/new'), newTemplate()))
    await assertSucceeds(getDoc(doc(db, 'templates/t1')))
    await assertSucceeds(updateDoc(doc(db, 'templates/t1'), { title: 'שם חדש' }))
    await assertSucceeds(deleteDoc(doc(db, 'templates/t1')))
  })

  it('a teacher manages template items', async () => {
    const db = as(ids.teacherA)
    await assertSucceeds(
      setDoc(doc(db, 'templates/t1/items/ti2'), {
        position: 2, title: 'אטיוד', metronomeBpm: 90, sheetPath: 'sheet-music/teacherA/a.pdf', notes: 'לאט',
      }),
    )
    await assertSucceeds(getDoc(doc(db, 'templates/t1/items/ti1')))
  })

  it("another teacher cannot read, edit or delete someone else's template", async () => {
    const db = as(ids.teacherB)
    await assertFails(getDoc(doc(db, 'templates/t1')))
    await assertFails(updateDoc(doc(db, 'templates/t1'), { title: 'x' }))
    await assertFails(deleteDoc(doc(db, 'templates/t1')))
    await assertFails(getDoc(doc(db, 'templates/t1/items/ti1')))
    await assertFails(setDoc(doc(db, 'templates/t1/items/ti2'), { position: 2, title: 'x' }))
  })

  it('a teacher cannot create a template in the name of another teacher', async () => {
    await assertFails(setDoc(doc(as(ids.teacherA), 'templates/new'), newTemplate('teacherB')))
  })

  it('a pending or rejected teacher cannot create templates', async () => {
    await assertFails(setDoc(doc(as(ids.teacherPending), 'templates/new'), newTemplate('teacherPending')))
    await assertFails(setDoc(doc(as(ids.teacherRejected), 'templates/new'), newTemplate('teacherRejected')))
  })

  it('students cannot read or create templates', async () => {
    await assertFails(getDoc(doc(as(ids.adultA), 'templates/t1')))
    await assertFails(getDoc(doc(as(ids.adultA), 'templates/t1/items/ti1')))
    await assertFails(setDoc(doc(as(ids.adultA), 'templates/new'), newTemplate('adultA')))
  })
})

describe('everything else is closed', () => {
  it('unknown collections are not accessible', async () => {
    await assertFails(getDoc(doc(as(ids.teacherA), 'secrets/x')))
    await assertFails(setDoc(doc(as(ids.teacherA), 'secrets/x'), { a: 1 }))
  })

  it('the development outbox is closed to every client', async () => {
    await assertFails(getDoc(doc(as(ids.teacherA), 'devOutbox/x')))
    await assertFails(setDoc(doc(as(ids.teacherA), 'devOutbox/x'), { to: 'a@b.com' }))
  })

  it('the attempt counters of the invite-code lock are closed to every client', async () => {
    await assertFails(getDoc(doc(as(ids.adultA), 'rateLimits/uid_adultA')))
    await assertFails(setDoc(doc(as(ids.adultA), 'rateLimits/uid_adultA'), { count: 0, windowStart: 0 }))
    await assertFails(getDoc(doc(as(ids.admin, { admin: true, email_verified: true }), 'rateLimits/uid_adultA')))
  })

  it('anonymous users cannot read or write anything', async () => {
    await assertFails(getDoc(doc(anonymous(), 'assignments/a1')))
    await assertFails(getDoc(doc(anonymous(), 'templates/t1')))
    await assertFails(getDoc(doc(anonymous(), 'practiceLogs/l1')))
    await assertFails(setDoc(doc(anonymous(), 'assignments/x'), { a: 1 }))
  })
})

describe('security hardening', () => {
  const asAnonymous = (uid: string) =>
    env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore()

  it('anonymous sign-in is refused everywhere, even on own profile', async () => {
    await assertFails(getDoc(doc(asAnonymous('adultA'), 'users/adultA')))
    await assertFails(
      setDoc(doc(asAnonymous('anon1'), 'users/anon1'), {
        role: 'student', name: 'x', createdAt: serverTimestamp(),
      }),
    )
  })

  it('an admin claim without a verified e-mail is not an admin', async () => {
    const unverified = as(ids.admin, { admin: true, email_verified: false })
    await assertFails(
      getDocs(query(collection(unverified, 'users'), where('role', '==', 'teacher'))),
    )
    const noFlag = as(ids.admin, { admin: true })
    await assertFails(
      getDocs(query(collection(noFlag, 'users'), where('role', '==', 'teacher'))),
    )
  })

  it('YouTube links must be real YouTube links', async () => {
    const base = { position: 2, title: 'אטיוד', status: 'working' }
    const db = as(ids.teacherA)
    for (const good of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=30s',
    ]) {
      await assertSucceeds(setDoc(doc(db, 'assignments/a1/items/yt'), { ...base, youtubeUrl: good }))
    }
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'http://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://evil.example/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/short',
    ]) {
      await assertFails(setDoc(doc(db, 'assignments/a1/items/yt'), { ...base, youtubeUrl: bad }))
    }
  })

  it('ids used inside paths must be plain ids (no slashes)', async () => {
    await assertFails(
      setDoc(doc(as(ids.teacherA), 'assignments/new'), {
        teacherId: 'teacherA', studentId: 'adultA/../x', title: 't', dailyGoalMinutes: 10,
        weekStart: ts('2026-10-11'), createdAt: serverTimestamp(),
      }),
    )
    await assertFails(
      setDoc(doc(as(ids.adultA), 'practiceLogs/new'), {
        studentId: 'adultA', teacherId: 'teacherA', assignmentId: 'a1/items/i1', seconds: 300,
        startedAt: Timestamp.now(), endedAt: Timestamp.now(),
      }),
    )
  })

  describe('practice log times must be believable', () => {
    const minutesAgo = (m: number) => Timestamp.fromMillis(Date.now() - m * 60000)
    const log = (over: Record<string, unknown>) => ({
      studentId: 'adultA', teacherId: 'teacherA', assignmentId: 'a1',
      seconds: 600, startedAt: minutesAgo(11), endedAt: minutesAgo(1), ...over,
    })
    const write = (data: object) => setDoc(doc(as(ids.adultA), 'practiceLogs/new'), data)

    it('a real session is accepted', async () => {
      await assertSucceeds(write(log({})))
    })

    it('cannot claim more seconds than the session lasted', async () => {
      await assertFails(write(log({ seconds: 3600 })))
      await assertFails(write(log({ seconds: 606 })))
    })

    it('cannot end in the future', async () => {
      await assertFails(
        write(log({ startedAt: Timestamp.fromMillis(Date.now() + 3600000), endedAt: Timestamp.fromMillis(Date.now() + 4200000) })),
      )
    })

    it('cannot backfill a session older than a week', async () => {
      await assertFails(
        write(log({ startedAt: minutesAgo(60 * 24 * 9), endedAt: minutesAgo(60 * 24 * 9 - 10) })),
      )
    })

    it('cannot start after it ended', async () => {
      await assertFails(write(log({ startedAt: minutesAgo(1), endedAt: minutesAgo(11) })))
    })
  })
})

describe('teacher confirmation of new students, and removal', () => {
  const newAssignment = (studentId: string) => ({
    teacherId: 'teacherA', studentId, title: 'פרק', dailyGoalMinutes: 10,
    weekStart: ts('2026-10-11'), createdAt: serverTimestamp(),
  })

  it('the teacher sees a pending student profile (to decide), nothing more', async () => {
    await assertSucceeds(getDoc(doc(as(ids.teacherA), 'users/pendingStudent')))
    await assertSucceeds(
      getDocs(query(collection(as(ids.teacherA), 'users'), where('teacherId', '==', 'teacherA'))),
    )
  })

  it('a pending student cannot approve themselves', async () => {
    await assertFails(updateDoc(doc(as(ids.pendingStudent), 'users/pendingStudent'), { linkStatus: 'approved' }))
  })

  it('a student cannot set or change linkStatus in any way', async () => {
    await assertFails(updateDoc(doc(as(ids.unlinked), 'users/unlinked'), { linkStatus: 'approved' }))
    await assertFails(updateDoc(doc(as(ids.adultA), 'users/adultA'), { linkStatus: 'pending' }))
  })

  it('the teacher cannot approve from the client (only a Cloud Function can)', async () => {
    await assertFails(updateDoc(doc(as(ids.teacherA), 'users/pendingStudent'), { linkStatus: 'approved' }))
    await assertFails(updateDoc(doc(as(ids.teacherA), 'users/removedStudent'), { teacherId: 'teacherA', linkStatus: 'approved' }))
  })

  it('no assignment can be created for a pending student', async () => {
    await assertFails(setDoc(doc(as(ids.teacherA), 'assignments/new'), newAssignment('pendingStudent')))
  })

  it('no assignment can be created for a removed student', async () => {
    await assertFails(setDoc(doc(as(ids.teacherA), 'assignments/new'), newAssignment('removedStudent')))
  })

  it('after removal the teacher loses access to everything of that student', async () => {
    const db = as(ids.teacherA)
    await assertFails(getDoc(doc(db, 'assignments/aR')))
    await assertFails(getDocs(query(collection(db, 'assignments'), where('teacherId', '==', 'teacherA'), where('studentId', '==', 'removedStudent'))))
    await assertFails(updateDoc(doc(db, 'assignments/aR'), { title: 'x' }))
    await assertFails(getDoc(doc(db, 'assignments/aR/items/i1')))
    await assertFails(setDoc(doc(db, 'assignments/aR/items/i2'), { position: 2, title: 'x', status: 'working' }))
    await assertFails(getDoc(doc(db, 'assignments/aR/items/i1/comments/c1')))
    await assertFails(
      setDoc(doc(db, 'assignments/aR/items/i1/comments/c2'), {
        authorId: 'teacherA', text: 'hi', createdAt: serverTimestamp(), readAt: null,
      }),
    )
    await assertFails(getDoc(doc(db, 'practiceLogs/lR')))
    await assertFails(getDoc(doc(db, 'users/removedStudent')))
  })

  it('the removed student still reads their own old assignment', async () => {
    await assertSucceeds(getDoc(doc(as(ids.removedStudent), 'assignments/aR')))
  })

  it('the teacher cannot read parent-consent records of a student that is not actively linked', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'parentConsents/pcP'), {
        studentId: 'pendingStudent', teacherId: 'teacherA', parentEmail: 'p@example.com',
        tokenHash: 'h', sentAt: Timestamp.now(), expiresAt: Timestamp.now(),
      })
    })
    await assertFails(getDoc(doc(as(ids.teacherA), 'parentConsents/pcP')))
  })
})

describe('teacher copyright statement', () => {
  it('a teacher records the statement once, with the server time', async () => {
    const ref = doc(as(ids.teacherPending), 'users/teacherPending')
    await assertSucceeds(updateDoc(ref, { copyrightStatementAt: serverTimestamp() }))
    await assertFails(updateDoc(ref, { copyrightStatementAt: serverTimestamp() }))
  })

  it('a pending teacher can give it, a fake time is refused', async () => {
    await assertFails(
      updateDoc(doc(as(ids.teacherPending), 'users/teacherPending'), { copyrightStatementAt: ts('2020-01-01') }),
    )
  })

  it('a student cannot write it', async () => {
    await assertFails(updateDoc(doc(as(ids.adultA), 'users/adultA'), { copyrightStatementAt: serverTimestamp() }))
  })

  it("a teacher cannot write it on someone else's profile", async () => {
    await assertFails(updateDoc(doc(as(ids.teacherA), 'users/teacherPending'), { copyrightStatementAt: serverTimestamp() }))
  })

  it('it cannot be combined with a status change or an invite code', async () => {
    await assertFails(
      updateDoc(doc(as(ids.teacherPending), 'users/teacherPending'), {
        copyrightStatementAt: serverTimestamp(), teacherStatus: 'approved',
      }),
    )
    await assertFails(
      updateDoc(doc(as(ids.teacherPending), 'users/teacherPending'), {
        copyrightStatementAt: serverTimestamp(), inviteCode: 'ABCDEF',
      }),
    )
  })
})
