import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { Timestamp } from 'firebase/firestore'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { INVITE_ALPHABET } from '../../functions/src/inviteCode'
import {
  callAs, createEnv, createUser, errorCodeOf, putUserDoc, readDoc, type TestUser,
} from './helpers'

let env: RulesTestEnvironment
let admin: TestUser

beforeAll(async () => {
  env = await createEnv()
  admin = await createUser({ claims: { admin: true } })
})
afterAll(async () => {
  await env.cleanup()
})

// A teacher account in Authentication plus the profile the app would have written.
async function newTeacher(opts: { statement?: boolean; status?: string; provider?: 'google' | 'password'; verified?: boolean } = {}) {
  const { statement = true, status = 'pending', provider = 'google', verified = true } = opts
  const user = await createUser({ provider, verified })
  await putUserDoc(env, user.uid, {
    role: 'teacher',
    teacherStatus: status,
    ...(statement ? { copyrightStatementAt: Timestamp.now() } : {}),
  })
  return user
}

describe('who may call the admin functions', () => {
  it('nobody who is signed out', async () => {
    for (const fn of ['listTeachers', 'approveTeacher', 'rejectTeacher']) {
      expect(await errorCodeOf(callAs(null, fn, { uid: 'abc' }))).toBe('functions/unauthenticated')
    }
  })

  it('not a student, not an approved teacher, not even the teacher being approved', async () => {
    const student = await createUser({ provider: 'password' })
    const teacher = await newTeacher({ status: 'approved' })
    const pending = await newTeacher()
    for (const who of [student, teacher, pending]) {
      for (const fn of ['listTeachers', 'approveTeacher', 'rejectTeacher']) {
        expect(await errorCodeOf(callAs(who, fn, { uid: pending.uid })), `${who.email} ${fn}`).toBe('functions/permission-denied')
      }
    }
    expect((await readDoc(env, `users/${pending.uid}`))?.teacherStatus).toBe('pending')
  })

  it('not someone with the admin claim but an unverified e-mail', async () => {
    const fake = await createUser({ provider: 'password', verified: false, claims: { admin: true } })
    expect(await errorCodeOf(callAs(fake, 'listTeachers'))).toBe('functions/permission-denied')
  })
})

describe('listTeachers', () => {
  it('shows pending and approved teachers with e-mail, never students or rejected', async () => {
    const pending = await newTeacher()
    const approved = await newTeacher({ status: 'approved' })
    const rejected = await newTeacher({ status: 'rejected' })
    const student = await createUser({ provider: 'password' })
    await putUserDoc(env, student.uid, { role: 'student' })

    const { teachers } = (await callAs(admin, 'listTeachers')) as { teachers: { uid: string; email: string; status: string; copyrightStatementAt: number | null }[] }
    const byUid = new Map(teachers.map((t) => [t.uid, t]))
    expect(byUid.get(pending.uid)?.email).toBe(pending.email)
    expect(byUid.get(pending.uid)?.status).toBe('pending')
    expect(byUid.get(pending.uid)?.copyrightStatementAt).toBeTypeOf('number')
    expect(byUid.get(approved.uid)?.status).toBe('approved')
    expect(byUid.has(rejected.uid)).toBe(false)
    expect(byUid.has(student.uid)).toBe(false)
  })

  it('counts only confirmed students of each teacher', async () => {
    const teacher = await newTeacher({ status: 'approved' })
    const other = await newTeacher({ status: 'approved' })
    const link = async (teacherId: string, linkStatus: string) => {
      const s = await createUser({ provider: 'password' })
      await putUserDoc(env, s.uid, { role: 'student', teacherId, linkStatus })
    }
    await link(teacher.uid, 'approved')
    await link(teacher.uid, 'approved')
    await link(teacher.uid, 'pending')
    await link(other.uid, 'approved')

    const { teachers } = (await callAs(admin, 'listTeachers')) as { teachers: { uid: string; studentCount: number }[] }
    const byUid = new Map(teachers.map((t) => [t.uid, t.studentCount]))
    expect(byUid.get(teacher.uid)).toBe(2)
    expect(byUid.get(other.uid)).toBe(1)
  })
})

describe('approveTeacher', () => {
  it('approves, and creates the invite code together with the approval', async () => {
    const teacher = await newTeacher()
    expect(await callAs(admin, 'approveTeacher', { uid: teacher.uid })).toEqual({ status: 'approved' })

    const profile = await readDoc(env, `users/${teacher.uid}`)
    expect(profile?.teacherStatus).toBe('approved')
    const code = profile?.inviteCode as string
    expect(code).toMatch(new RegExp(`^[${INVITE_ALPHABET}]{6}$`))
    expect(await readDoc(env, `inviteCodes/${code}`)).toEqual({ teacherId: teacher.uid })
  })

  it('is safe to press twice: same code, nothing duplicated', async () => {
    const teacher = await newTeacher()
    await callAs(admin, 'approveTeacher', { uid: teacher.uid })
    const first = (await readDoc(env, `users/${teacher.uid}`))?.inviteCode
    await callAs(admin, 'approveTeacher', { uid: teacher.uid })
    expect((await readDoc(env, `users/${teacher.uid}`))?.inviteCode).toBe(first)
  })

  it('two clicks at the same moment still give one code', async () => {
    const teacher = await newTeacher()
    await Promise.all([
      callAs(admin, 'approveTeacher', { uid: teacher.uid }),
      callAs(admin, 'approveTeacher', { uid: teacher.uid }),
    ])
    const code = (await readDoc(env, `users/${teacher.uid}`))?.inviteCode as string
    expect(await readDoc(env, `inviteCodes/${code}`)).toEqual({ teacherId: teacher.uid })
  })

  it('every teacher gets a different code', async () => {
    const teachers = await Promise.all([newTeacher(), newTeacher(), newTeacher()])
    for (const t of teachers) await callAs(admin, 'approveTeacher', { uid: t.uid })
    const codes = await Promise.all(teachers.map(async (t) => (await readDoc(env, `users/${t.uid}`))?.inviteCode))
    expect(new Set(codes).size).toBe(3)
  })

  it('refuses a teacher who did not give the copyright statement', async () => {
    const teacher = await newTeacher({ statement: false })
    expect(await errorCodeOf(callAs(admin, 'approveTeacher', { uid: teacher.uid }))).toBe('functions/failed-precondition')
    expect((await readDoc(env, `users/${teacher.uid}`))?.teacherStatus).toBe('pending')
  })

  it('refuses an unverified e-mail and a non-Google account', async () => {
    const unverified = await newTeacher({ verified: false })
    const password = await newTeacher({ provider: 'password' })
    expect(await errorCodeOf(callAs(admin, 'approveTeacher', { uid: unverified.uid }))).toBe('functions/failed-precondition')
    expect(await errorCodeOf(callAs(admin, 'approveTeacher', { uid: password.uid }))).toBe('functions/failed-precondition')
  })

  it('refuses students, rejected teachers, unknown and malformed ids', async () => {
    const student = await createUser({ provider: 'google' })
    await putUserDoc(env, student.uid, { role: 'student' })
    const rejected = await newTeacher({ status: 'rejected' })
    expect(await errorCodeOf(callAs(admin, 'approveTeacher', { uid: student.uid }))).toBe('functions/failed-precondition')
    expect((await readDoc(env, `users/${student.uid}`))?.teacherStatus).toBeUndefined()
    expect(await errorCodeOf(callAs(admin, 'approveTeacher', { uid: rejected.uid }))).toBe('functions/failed-precondition')
    expect(await errorCodeOf(callAs(admin, 'approveTeacher', { uid: 'no-such-user' }))).toBe('functions/not-found')
    for (const bad of ['a/b', '', '../x', 123, null]) {
      expect(await errorCodeOf(callAs(admin, 'approveTeacher', { uid: bad }))).toBe('functions/invalid-argument')
    }
    expect(await errorCodeOf(callAs(admin, 'approveTeacher'))).toBe('functions/invalid-argument')
  })
})

describe('rejectTeacher', () => {
  it('rejects a pending teacher and creates no invite code', async () => {
    const teacher = await newTeacher()
    expect(await callAs(admin, 'rejectTeacher', { uid: teacher.uid })).toEqual({ status: 'rejected' })
    const profile = await readDoc(env, `users/${teacher.uid}`)
    expect(profile?.teacherStatus).toBe('rejected')
    expect(profile?.inviteCode).toBeUndefined()
  })

  it('cannot reject someone who is already approved, nor a student', async () => {
    const approved = await newTeacher({ status: 'approved' })
    const student = await createUser({ provider: 'password' })
    await putUserDoc(env, student.uid, { role: 'student' })
    expect(await errorCodeOf(callAs(admin, 'rejectTeacher', { uid: approved.uid }))).toBe('functions/failed-precondition')
    expect(await errorCodeOf(callAs(admin, 'rejectTeacher', { uid: student.uid }))).toBe('functions/failed-precondition')
    expect((await readDoc(env, `users/${approved.uid}`))?.teacherStatus).toBe('approved')
  })

  it('a rejected teacher can never be approved afterwards', async () => {
    const teacher = await newTeacher()
    await callAs(admin, 'rejectTeacher', { uid: teacher.uid })
    expect(await errorCodeOf(callAs(admin, 'approveTeacher', { uid: teacher.uid }))).toBe('functions/failed-precondition')
  })
})
