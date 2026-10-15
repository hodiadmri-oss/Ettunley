import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { INVITE_ALPHABET } from '../../functions/src/inviteCode'
import { callAs, createEnv, createUser, errorCodeOf, putDoc, putUserDoc, readDoc, type TestUser } from './helpers'

let env: RulesTestEnvironment
let counter = 0

beforeAll(async () => {
  env = await createEnv()
})
afterAll(async () => {
  await env.cleanup()
})

// A fresh invite code that does not clash with any other test.
const freshCode = () => {
  counter++
  const digits = String(counter).padStart(6, '2')
  return digits.replace(/[01]/g, '2').slice(-6)
}

async function newTeacher(status = 'approved') {
  const user = await createUser({ provider: 'google' })
  const code = freshCode()
  await putUserDoc(env, user.uid, { role: 'teacher', name: 'המורה', teacherStatus: status, inviteCode: code })
  await putDoc(env, `inviteCodes/${code}`, { teacherId: user.uid })
  return { user, code }
}

async function newStudent(extra: Record<string, unknown> = {}) {
  const user = await createUser({ provider: 'password' })
  await putUserDoc(env, user.uid, { role: 'student', name: 'תלמיד', ...extra })
  return user
}

const join = (who: TestUser | null, code: unknown) => callAs(who, 'joinTeacher', { code })
const respond = (who: TestUser | null, studentId: unknown, decision: unknown) =>
  callAs(who, 'respondToStudent', { studentId, decision })

describe('joinTeacher', () => {
  it('creates a PENDING link with the teacher name, and nothing else', async () => {
    const { user: teacher, code } = await newTeacher()
    const student = await newStudent()
    expect(await join(student, code)).toEqual({ status: 'pending' })
    const profile = await readDoc(env, `users/${student.uid}`)
    expect(profile).toMatchObject({ teacherId: teacher.uid, teacherName: 'המורה', linkStatus: 'pending' })
  })

  it('accepts the code typed in lower case and with spaces', async () => {
    const { code } = await newTeacher()
    const student = await newStudent()
    const typed = ` ${code.slice(0, 3)} ${code.slice(3)} `.toLowerCase()
    expect(await join(student, typed)).toEqual({ status: 'pending' })
  })

  it('a wrong code, a malformed code and an empty code all give the very same answer', async () => {
    const student = await newStudent()
    const answers = []
    for (const bad of ['ZZZZZZ', 'abc', '', null, 12345, 'O0O0O0']) {
      answers.push(await errorCodeOf(join(student, bad)))
    }
    expect(new Set(answers)).toEqual(new Set(['functions/permission-denied']))
  })

  it('after 5 wrong tries even the right code is refused (and looks the same)', async () => {
    const { code } = await newTeacher()
    const student = await newStudent()
    for (let i = 0; i < 5; i++) await errorCodeOf(join(student, 'ZZZZZZ'))
    expect(await errorCodeOf(join(student, code))).toBe('functions/permission-denied')
    expect((await readDoc(env, `users/${student.uid}`))?.teacherId).toBeUndefined()
  })

  it('a successful join resets the counter', async () => {
    const { code } = await newTeacher()
    const student = await newStudent()
    for (let i = 0; i < 3; i++) await errorCodeOf(join(student, 'ZZZZZZ'))
    expect(await join(student, code)).toEqual({ status: 'pending' })
    expect(await readDoc(env, `rateLimits/uid_${student.uid}`)).toBeUndefined()
  })

  it('refuses the code of a teacher who is not approved', async () => {
    const { code } = await newTeacher('rejected')
    const student = await newStudent()
    expect(await errorCodeOf(join(student, code))).toBe('functions/permission-denied')
  })

  it('refuses people who are not students, and signed-out callers', async () => {
    const { user: teacher, code } = await newTeacher()
    expect(await errorCodeOf(join(teacher, code))).toBe('functions/permission-denied')
    expect(await errorCodeOf(join(null, code))).toBe('functions/unauthenticated')
  })

  it('a student who already has a teacher cannot switch', async () => {
    const first = await newTeacher()
    const second = await newTeacher()
    const student = await newStudent()
    await join(student, first.code)
    expect(await errorCodeOf(join(student, second.code))).toBe('functions/failed-precondition')
    expect((await readDoc(env, `users/${student.uid}`))?.teacherId).toBe(first.user.uid)
  })
})

describe('respondToStudent', () => {
  async function pendingPair() {
    const teacher = await newTeacher()
    const student = await newStudent()
    await join(student, teacher.code)
    return { teacher: teacher.user, student }
  }

  it('the teacher approves; pressing twice is harmless', async () => {
    const { teacher, student } = await pendingPair()
    expect(await respond(teacher, student.uid, 'approve')).toEqual({ status: 'approved' })
    expect(await respond(teacher, student.uid, 'approve')).toEqual({ status: 'approved' })
    expect((await readDoc(env, `users/${student.uid}`))?.linkStatus).toBe('approved')
  })

  it('rejecting clears the link, so the student can try another code', async () => {
    const { teacher, student } = await pendingPair()
    expect(await respond(teacher, student.uid, 'reject')).toEqual({ status: 'rejected' })
    const profile = await readDoc(env, `users/${student.uid}`)
    expect(profile?.teacherId).toBeUndefined()
    expect(profile?.linkStatus).toBeUndefined()
    expect(profile?.teacherName).toBeUndefined()
    const other = await newTeacher()
    expect(await join(student, other.code)).toEqual({ status: 'pending' })
  })

  it('cannot reject a student who was already approved (that is "remove")', async () => {
    const { teacher, student } = await pendingPair()
    await respond(teacher, student.uid, 'approve')
    expect(await errorCodeOf(respond(teacher, student.uid, 'reject'))).toBe('functions/failed-precondition')
  })

  it("another teacher cannot touch someone else's student", async () => {
    const { student } = await pendingPair()
    const stranger = (await newTeacher()).user
    expect(await errorCodeOf(respond(stranger, student.uid, 'approve'))).toBe('functions/permission-denied')
    expect(await errorCodeOf(respond(stranger, student.uid, 'reject'))).toBe('functions/permission-denied')
    expect((await readDoc(env, `users/${student.uid}`))?.linkStatus).toBe('pending')
  })

  it('a student, a pending teacher and a signed-out caller cannot decide', async () => {
    const { teacher, student } = await pendingPair()
    const pending = (await newTeacher('pending')).user
    expect(await errorCodeOf(respond(student, student.uid, 'approve'))).toBe('functions/permission-denied')
    expect(await errorCodeOf(respond(pending, student.uid, 'approve'))).toBe('functions/permission-denied')
    expect(await errorCodeOf(respond(null, student.uid, 'approve'))).toBe('functions/unauthenticated')
    expect((await readDoc(env, `users/${student.uid}`))?.linkStatus).toBe('pending')
    void teacher
  })

  it('rejects malformed input', async () => {
    const { teacher, student } = await pendingPair()
    expect(await errorCodeOf(respond(teacher, 'a/b', 'approve'))).toBe('functions/invalid-argument')
    expect(await errorCodeOf(respond(teacher, student.uid, 'maybe'))).toBe('functions/invalid-argument')
    expect(await errorCodeOf(respond(teacher, undefined, 'approve'))).toBe('functions/invalid-argument')
  })
})

describe('removeStudent', () => {
  it('removes an approved student: the link is gone, the student keeps their own data', async () => {
    const teacher = await newTeacher()
    const student = await newStudent({ instrument: 'פסנתר' })
    await join(student, teacher.code)
    await respond(teacher.user, student.uid, 'approve')
    expect(await callAs(teacher.user, 'removeStudent', { studentId: student.uid })).toEqual({ status: 'removed' })
    const profile = await readDoc(env, `users/${student.uid}`)
    expect(profile?.teacherId).toBeUndefined()
    expect(profile?.linkStatus).toBeUndefined()
    expect(profile?.instrument).toBe('פסנתר')
  })

  it("only that student's teacher can remove them", async () => {
    const teacher = await newTeacher()
    const student = await newStudent()
    await join(student, teacher.code)
    const stranger = (await newTeacher()).user
    expect(await errorCodeOf(callAs(stranger, 'removeStudent', { studentId: student.uid }))).toBe('functions/permission-denied')
    expect(await errorCodeOf(callAs(student, 'removeStudent', { studentId: student.uid }))).toBe('functions/permission-denied')
    expect((await readDoc(env, `users/${student.uid}`))?.teacherId).toBe(teacher.user.uid)
  })

  it('cannot remove a student who has no teacher, or an unknown id', async () => {
    const teacher = await newTeacher()
    const unlinked = await newStudent()
    expect(await errorCodeOf(callAs(teacher.user, 'removeStudent', { studentId: unlinked.uid }))).toBe('functions/permission-denied')
    expect(await errorCodeOf(callAs(teacher.user, 'removeStudent', { studentId: 'nobody' }))).toBe('functions/permission-denied')
  })
})

describe('regenerateInviteCode', () => {
  it('gives a new code, and the old one stops working at once', async () => {
    const teacher = await newTeacher()
    await callAs(teacher.user, 'regenerateInviteCode')
    const profile = await readDoc(env, `users/${teacher.user.uid}`)
    const newCode = profile?.inviteCode as string
    expect(newCode).not.toBe(teacher.code)
    expect(newCode).toMatch(new RegExp(`^[${INVITE_ALPHABET}]{6}$`))
    expect(await readDoc(env, `inviteCodes/${newCode}`)).toEqual({ teacherId: teacher.user.uid })
    expect(await readDoc(env, `inviteCodes/${teacher.code}`)).toBeUndefined()

    const student = await newStudent()
    expect(await errorCodeOf(join(student, teacher.code))).toBe('functions/permission-denied')
    expect(await join(student, newCode)).toEqual({ status: 'pending' })
  })

  it('does not disturb students who already joined', async () => {
    const teacher = await newTeacher()
    const student = await newStudent()
    await join(student, teacher.code)
    await respond(teacher.user, student.uid, 'approve')
    await callAs(teacher.user, 'regenerateInviteCode')
    expect((await readDoc(env, `users/${student.uid}`))?.linkStatus).toBe('approved')
  })

  it('only an approved teacher can do it', async () => {
    const pending = (await newTeacher('pending')).user
    const student = await newStudent()
    expect(await errorCodeOf(callAs(pending, 'regenerateInviteCode'))).toBe('functions/permission-denied')
    expect(await errorCodeOf(callAs(student, 'regenerateInviteCode'))).toBe('functions/permission-denied')
    expect(await errorCodeOf(callAs(null, 'regenerateInviteCode'))).toBe('functions/unauthenticated')
  })
})

