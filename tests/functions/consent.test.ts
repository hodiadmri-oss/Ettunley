import { createHash } from 'node:crypto'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { Timestamp } from 'firebase/firestore'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  callAs, createEnv, createUser, emailsTo, errorCodeOf, patchDoc, putDoc, putUserDoc, readDoc, type TestUser,
} from './helpers'

let env: RulesTestEnvironment
let counter = 0

beforeAll(async () => {
  env = await createEnv()
})
afterAll(async () => {
  await env.cleanup()
})

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex')

async function newTeacher(name = 'דנה') {
  const user = await createUser({ provider: 'google' })
  await putUserDoc(env, user.uid, { role: 'teacher', name, teacherStatus: 'approved', inviteCode: `T${counter++}` })
  return user
}

async function newStudent(teacher: TestUser, extra: Record<string, unknown> = {}) {
  const user = await createUser({ provider: 'password' })
  await putUserDoc(env, user.uid, {
    role: 'student', name: 'נועה', isMinor: true, teacherId: teacher.uid, teacherName: 'דנה',
    linkStatus: 'approved', ...extra,
  })
  return user
}

const parentEmail = () => `parent${Date.now()}-${counter++}@example.com`
const send = (teacher: TestUser | null, studentId: unknown, email: unknown) =>
  callAs(teacher, 'sendParentConsent', { studentId, parentEmail: email })

// Sends the e-mail and returns the secret token from the link inside it.
async function sendAndGetToken(teacher: TestUser, student: TestUser, email = parentEmail()) {
  await send(teacher, student.uid, email)
  const mails = await emailsTo(env, email)
  const token = mails[mails.length - 1].text.match(/\/consent\/approve#([A-Za-z0-9_-]{43})/)?.[1]
  expect(token, 'the e-mail has a personal link').toBeTruthy()
  return { token: token as string, email, mail: mails[mails.length - 1] }
}

describe('sendParentConsent', () => {
  it('stores only a hash of a random token and e-mails the link in Hebrew', async () => {
    const teacher = await newTeacher()
    const student = await newStudent(teacher)
    const { token, mail, email } = await sendAndGetToken(teacher, student)

    const consent = await readDoc(env, `parentConsents/${student.uid}`)
    expect(consent?.tokenHash).toBe(sha256(token))
    expect(JSON.stringify(consent)).not.toContain(token)
    expect(consent).toMatchObject({ studentId: student.uid, teacherId: teacher.uid, parentEmail: email })
    const days = ((consent?.expiresAt as Timestamp).toMillis() - (consent?.sentAt as Timestamp).toMillis()) / 86400000
    expect(days).toBeGreaterThan(6.9)
    expect(days).toBeLessThan(7.1)

    expect(mail.subject).toBe('אישור הורה לשימוש באפליקציה')
    expect(mail.text).toContain('נועה')
    expect(mail.text).toContain('פעם אחת בלבד')
    expect(mail.text).toContain('12 חודשים')
    expect(mail.text).not.toContain('example.invalid') // the placeholder address is never shown
  })

  it('escapes names so a child cannot put HTML or a link in the e-mail', async () => {
    const teacher = await newTeacher()
    const student = await newStudent(teacher, { name: '<img src=x onerror=alert(1)> "ילד"' })
    const { mail } = await sendAndGetToken(teacher, student)
    expect(mail.html).not.toContain('<img')
    expect(mail.html).toContain('&lt;img')
  })

  it('sending again replaces the link: the old one stops working', async () => {
    const teacher = await newTeacher()
    const student = await newStudent(teacher)
    const first = await sendAndGetToken(teacher, student)
    const second = await sendAndGetToken(teacher, student, parentEmail())
    expect(second.token).not.toBe(first.token)
    expect(await callAs(null, 'getParentConsentInfo', { token: first.token })).toEqual({ valid: false })
    expect(await callAs(null, 'getParentConsentInfo', { token: second.token })).toMatchObject({ valid: true })
  })

  it('allows only 3 sends per student per day', async () => {
    const teacher = await newTeacher()
    const student = await newStudent(teacher)
    for (let i = 0; i < 3; i++) await send(teacher, student.uid, parentEmail())
    expect(await errorCodeOf(send(teacher, student.uid, parentEmail()))).toBe('functions/resource-exhausted')
  })

  it('refuses a bad address, with no mail sent', async () => {
    const teacher = await newTeacher()
    const student = await newStudent(teacher)
    for (const bad of ['', 'nope', 'a@b', 'two@x.com,three@y.com', 'a b@c.com', '<x>@y.com', 123, null, 'x'.repeat(300) + '@a.com']) {
      expect(await errorCodeOf(send(teacher, student.uid, bad)), String(bad)).toBe('functions/invalid-argument')
    }
  })

  it('only for a CONFIRMED student of this teacher who is a MINOR without consent', async () => {
    const teacher = await newTeacher()
    const other = await newTeacher()
    const mine = await newStudent(teacher)
    const pending = await newStudent(teacher, { linkStatus: 'pending' })
    const adult = await newStudent(teacher, { isMinor: false })
    const done = await newStudent(teacher, { consentAt: Timestamp.now(), consentBy: 'parent' })
    expect(await errorCodeOf(send(other, mine.uid, parentEmail()))).toBe('functions/permission-denied')
    expect(await errorCodeOf(send(teacher, pending.uid, parentEmail()))).toBe('functions/failed-precondition')
    expect(await errorCodeOf(send(teacher, adult.uid, parentEmail()))).toBe('functions/failed-precondition')
    expect(await errorCodeOf(send(teacher, done.uid, parentEmail()))).toBe('functions/failed-precondition')
    expect(await errorCodeOf(send(teacher, 'no-such-student', parentEmail()))).toBe('functions/permission-denied')
    expect(await errorCodeOf(send(teacher, 'a/b', parentEmail()))).toBe('functions/invalid-argument')
  })

  it('not a student, not a pending teacher, not a signed-out caller', async () => {
    const teacher = await newTeacher()
    const student = await newStudent(teacher)
    const pendingTeacher = await createUser({ provider: 'google' })
    await putUserDoc(env, pendingTeacher.uid, { role: 'teacher', teacherStatus: 'pending' })
    expect(await errorCodeOf(send(student, student.uid, parentEmail()))).toBe('functions/permission-denied')
    expect(await errorCodeOf(send(pendingTeacher, student.uid, parentEmail()))).toBe('functions/permission-denied')
    expect(await errorCodeOf(send(null, student.uid, parentEmail()))).toBe('functions/unauthenticated')
  })
})

describe('the public link', () => {
  it('shows who the consent is for, without needing an account', async () => {
    const teacher = await newTeacher('רונית')
    const student = await newStudent(teacher, { teacherName: 'רונית' })
    const { token } = await sendAndGetToken(teacher, student)
    expect(await callAs(null, 'getParentConsentInfo', { token })).toEqual({
      valid: true, childName: 'נועה', teacherName: 'רונית', textVersion: 1,
    })
  })

  it('looking at the link never approves anything', async () => {
    const teacher = await newTeacher()
    const student = await newStudent(teacher)
    const { token } = await sendAndGetToken(teacher, student)
    for (let i = 0; i < 3; i++) await callAs(null, 'getParentConsentInfo', { token })
    expect((await readDoc(env, `users/${student.uid}`))?.consentAt).toBeUndefined()
  })

  it('wrong, malformed, empty and missing tokens all give the same answer', async () => {
    const answers = []
    for (const token of ['A'.repeat(43), 'short', '', null, undefined, 42, '../../x']) {
      answers.push(JSON.stringify(await callAs(null, 'getParentConsentInfo', { token })))
    }
    expect(new Set(answers)).toEqual(new Set([JSON.stringify({ valid: false })]))
  })

  it('an expired link looks the same as a wrong one', async () => {
    const teacher = await newTeacher()
    const student = await newStudent(teacher)
    const { token } = await sendAndGetToken(teacher, student)
    await patchDoc(env, `parentConsents/${student.uid}`, { expiresAt: Timestamp.fromMillis(Date.now() - 1000) })
    expect(await callAs(null, 'getParentConsentInfo', { token })).toEqual({ valid: false })
    expect(await errorCodeOf(callAs(null, 'approveParentConsent', { token, parentName: 'אמא', textVersion: 1 }))).toBe('functions/failed-precondition')
  })
})

describe('approveParentConsent', () => {
  const approve = (token: unknown, parentName: unknown = 'מיכל כהן', textVersion: unknown = 1) =>
    callAs(null, 'approveParentConsent', { token, parentName, textVersion })

  it('records the parent, opens recording for the child, and kills the link', async () => {
    const teacher = await newTeacher()
    const student = await newStudent(teacher)
    const { token } = await sendAndGetToken(teacher, student)
    expect(await approve(token)).toEqual({ status: 'approved' })

    const profile = await readDoc(env, `users/${student.uid}`)
    expect(profile?.consentBy).toBe('parent')
    expect(profile?.consentAt).toBeInstanceOf(Timestamp)

    const consent = await readDoc(env, `parentConsents/${student.uid}`)
    expect(consent?.parentName).toBe('מיכל כהן')
    expect(consent?.approvedAt).toBeInstanceOf(Timestamp)
    expect(consent?.consentTextVersion).toBe(1)
    expect(consent?.tokenHash).toBeUndefined()

    expect(await callAs(null, 'getParentConsentInfo', { token })).toEqual({ valid: false })
  })

  it('works once only, also when pressed twice at the same moment', async () => {
    const teacher = await newTeacher()
    const student = await newStudent(teacher)
    const { token } = await sendAndGetToken(teacher, student)
    const results = await Promise.all([errorCodeOf(approve(token)), errorCodeOf(approve(token))])
    expect(results.filter((r) => r === 'no-error')).toHaveLength(1)
    expect(await errorCodeOf(approve(token))).toBe('functions/failed-precondition')
  })

  it('needs a name and the current text version', async () => {
    const teacher = await newTeacher()
    const student = await newStudent(teacher)
    const { token } = await sendAndGetToken(teacher, student)
    for (const name of ['', '   ', 'x'.repeat(61), null, 5]) {
      expect(await errorCodeOf(approve(token, name)), String(name)).toBe('functions/invalid-argument')
    }
    expect(await errorCodeOf(approve(token, 'אמא', 0))).toBe('functions/failed-precondition')
    expect(await errorCodeOf(approve(token, 'אמא', null))).toBe('functions/failed-precondition')
    expect((await readDoc(env, `users/${student.uid}`))?.consentAt).toBeUndefined()
  })

  it('a wrong token approves nothing', async () => {
    const teacher = await newTeacher()
    const student = await newStudent(teacher)
    await sendAndGetToken(teacher, student)
    expect(await errorCodeOf(approve('A'.repeat(43)))).toBe('functions/failed-precondition')
    expect((await readDoc(env, `users/${student.uid}`))?.consentAt).toBeUndefined()
  })

  it('does not approve if the student was removed from the teacher in the meantime', async () => {
    const teacher = await newTeacher()
    const student = await newStudent(teacher)
    const { token } = await sendAndGetToken(teacher, student)
    await putDoc(env, `users/${student.uid}`, { role: 'student', name: 'נועה', isMinor: true })
    expect(await errorCodeOf(approve(token))).toBe('functions/failed-precondition')
    expect((await readDoc(env, `users/${student.uid}`))?.consentAt).toBeUndefined()
  })
})
