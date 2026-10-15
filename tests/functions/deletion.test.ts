import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AdminTimestamp as Timestamp, adminDb, authUserExists, docData, docExists, fileExists, putFile } from './adminSdk'
import { callAs, createEnv, createUser, errorCodeOf, type TestUser } from './helpers'

let env: RulesTestEnvironment
let admin: TestUser
let counter = 0

beforeAll(async () => {
  env = await createEnv()
  admin = await createUser({ claims: { admin: true } })
})
afterAll(async () => {
  await env.cleanup()
})

interface Person {
  user: TestUser
  id: string
}

// One teacher with two students (an adult and a minor whose parent consented), plus
// all the things the app creates for them. Every id is unique so tests do not collide.
async function buildWorld() {
  const n = counter++
  const db = adminDb()
  const now = Timestamp.now()

  const teacher = await createUser({ provider: 'google' })
  const adult = await createUser({ provider: 'password' })
  const minor = await createUser({ provider: 'password' })
  const T = teacher.uid, A = adult.uid, M = minor.uid
  const code = `Z${String(n).padStart(5, '2')}`.slice(0, 6)

  await db.doc(`users/${T}`).set({ role: 'teacher', name: 'המורה', teacherStatus: 'approved', inviteCode: code, createdAt: now })
  await db.doc(`inviteCodes/${code}`).set({ teacherId: T })
  await db.doc(`users/${A}`).set({
    role: 'student', name: 'בוגר', isMinor: false, teacherId: T, teacherName: 'המורה', linkStatus: 'approved',
    consentBy: 'self', consentAt: now, instrument: 'פסנתר', createdAt: now,
  })
  await db.doc(`users/${M}`).set({
    role: 'student', name: 'קטין', isMinor: true, teacherId: T, teacherName: 'המורה', linkStatus: 'approved',
    consentBy: 'parent', consentAt: now, instrument: 'כינור', createdAt: now,
  })
  await db.doc(`parentConsents/${M}`).set({ studentId: M, teacherId: T, parentName: 'הורה', approvedAt: now })

  await putFile(`sheet-music/${T}/score.pdf`, 'application/pdf')
  await db.doc(`templates/tpl${n}`).set({ teacherId: T, title: 'תבנית', dailyGoalMinutes: 10, createdAt: now })
  await db.doc(`templates/tpl${n}/items/ti`).set({ position: 1, title: 'סולם' })

  for (const [student, key] of [[A, 'a'], [M, 'm']] as const) {
    const aid = `${key}${n}`
    await db.doc(`assignments/${aid}`).set({ teacherId: T, studentId: student, title: 'מטלה', dailyGoalMinutes: 10, createdAt: now })
    await db.doc(`assignments/${aid}/items/i1`).set({
      position: 1, title: 'פריט', status: 'ready',
      recording: { path: `recordings/${student}/${aid}/i1`, durationSeconds: 60, uploadedAt: now },
    })
    await db.doc(`assignments/${aid}/items/i1/comments/c1`).set({ authorId: T, text: 'יפה', createdAt: now, readAt: null })
    await putFile(`recordings/${student}/${aid}/i1`)
    await db.doc(`practiceLogs/log${key}${n}`).set({
      studentId: student, teacherId: T, assignmentId: aid, minutes: 10, startedAt: now, endedAt: now,
    })
  }

  // Someone else entirely: must never be touched.
  const other = await createUser({ provider: 'google' })
  const bystander = await createUser({ provider: 'password' })
  await db.doc(`users/${other.uid}`).set({ role: 'teacher', name: 'אחרת', teacherStatus: 'approved', inviteCode: `Q${code.slice(1)}`, createdAt: now })
  await db.doc(`users/${bystander.uid}`).set({ role: 'student', name: 'עומד מהצד', isMinor: false, teacherId: other.uid, linkStatus: 'approved', createdAt: now })
  await db.doc(`assignments/b${n}`).set({ teacherId: other.uid, studentId: bystander.uid, title: 'של אחרים', dailyGoalMinutes: 5, createdAt: now })
  await db.doc(`assignments/b${n}/items/i1`).set({ position: 1, title: 'x', status: 'working' })
  await db.doc(`practiceLogs/logb${n}`).set({ studentId: bystander.uid, teacherId: other.uid, assignmentId: `b${n}`, minutes: 5, startedAt: now, endedAt: now })
  await putFile(`recordings/${bystander.uid}/b${n}/i1`)
  await putFile(`sheet-music/${other.uid}/theirs.pdf`, 'application/pdf')

  return {
    n, code,
    teacher: { user: teacher, id: T } as Person,
    adult: { user: adult, id: A } as Person,
    minor: { user: minor, id: M } as Person,
    other: { user: other, id: other.uid } as Person,
    bystander: { user: bystander, id: bystander.uid } as Person,
  }
}

type World = Awaited<ReturnType<typeof buildWorld>>

async function expectBystanderIntact(w: World) {
  expect(await docExists(`users/${w.other.id}`)).toBe(true)
  expect(await docExists(`users/${w.bystander.id}`)).toBe(true)
  expect(await docExists(`assignments/b${w.n}/items/i1`)).toBe(true)
  expect(await docExists(`practiceLogs/logb${w.n}`)).toBe(true)
  expect(await fileExists(`recordings/${w.bystander.id}/b${w.n}/i1`)).toBe(true)
  expect(await fileExists(`sheet-music/${w.other.id}/theirs.pdf`)).toBe(true)
  expect(await authUserExists(w.other.id)).toBe(true)
  expect(await authUserExists(w.bystander.id)).toBe(true)
}

describe('deleteMyAccount: a student', () => {
  it('removes everything of theirs and nothing of anyone else', async () => {
    const w = await buildWorld()
    expect(await callAs(w.adult.user, 'deleteMyAccount', { confirm: true })).toEqual({ status: 'deleted' })

    expect(await docExists(`users/${w.adult.id}`)).toBe(false)
    expect(await docExists(`assignments/a${w.n}`)).toBe(false)
    expect(await docExists(`assignments/a${w.n}/items/i1`)).toBe(false)
    expect(await docExists(`assignments/a${w.n}/items/i1/comments/c1`)).toBe(false)
    expect(await docExists(`practiceLogs/loga${w.n}`)).toBe(false)
    expect(await fileExists(`recordings/${w.adult.id}/a${w.n}/i1`)).toBe(false)
    expect(await authUserExists(w.adult.id)).toBe(false)

    // the teacher and the other student are untouched
    expect(await docExists(`users/${w.teacher.id}`)).toBe(true)
    expect(await docExists(`templates/tpl${w.n}`)).toBe(true)
    expect(await fileExists(`sheet-music/${w.teacher.id}/score.pdf`)).toBe(true)
    expect(await docExists(`assignments/m${w.n}/items/i1`)).toBe(true)
    expect(await fileExists(`recordings/${w.minor.id}/m${w.n}/i1`)).toBe(true)
    expect(await docExists(`practiceLogs/logm${w.n}`)).toBe(true)
    await expectBystanderIntact(w)
  })

  it('a minor: also the parent consent record', async () => {
    const w = await buildWorld()
    await callAs(w.minor.user, 'deleteMyAccount', { confirm: true })
    expect(await docExists(`users/${w.minor.id}`)).toBe(false)
    expect(await docExists(`parentConsents/${w.minor.id}`)).toBe(false)
    expect(await fileExists(`recordings/${w.minor.id}/m${w.n}/i1`)).toBe(false)
    expect(await authUserExists(w.minor.id)).toBe(false)
    expect(await docExists(`users/${w.adult.id}`)).toBe(true)
    await expectBystanderIntact(w)
  })
})

describe('deleteMyAccount: a teacher', () => {
  it('removes what they created, unlinks their students and keeps the students\' own data', async () => {
    const w = await buildWorld()
    await callAs(w.teacher.user, 'deleteMyAccount', { confirm: true })

    expect(await docExists(`users/${w.teacher.id}`)).toBe(false)
    expect(await docExists(`inviteCodes/${w.code}`)).toBe(false)
    expect(await docExists(`templates/tpl${w.n}`)).toBe(false)
    expect(await docExists(`templates/tpl${w.n}/items/ti`)).toBe(false)
    expect(await fileExists(`sheet-music/${w.teacher.id}/score.pdf`)).toBe(false)
    expect(await authUserExists(w.teacher.id)).toBe(false)
    // assignments, comments, logs and the recordings attached to them
    for (const key of ['a', 'm']) {
      expect(await docExists(`assignments/${key}${w.n}`)).toBe(false)
      expect(await docExists(`assignments/${key}${w.n}/items/i1/comments/c1`)).toBe(false)
      expect(await docExists(`practiceLogs/log${key}${w.n}`)).toBe(false)
    }
    expect(await fileExists(`recordings/${w.adult.id}/a${w.n}/i1`)).toBe(false)
    expect(await fileExists(`recordings/${w.minor.id}/m${w.n}/i1`)).toBe(false)

    // the students remain, no longer linked
    const adult = await docData(`users/${w.adult.id}`)
    expect(adult).toMatchObject({ name: 'בוגר', instrument: 'פסנתר' })
    expect(adult?.teacherId).toBeUndefined()
    expect(adult?.linkStatus).toBeUndefined()
    expect(adult?.consentAt).toBeDefined() // an adult's "my teacher" consent stays

    const minor = await docData(`users/${w.minor.id}`)
    expect(minor?.teacherId).toBeUndefined()
    expect(minor?.consentAt).toBeUndefined() // a parent's consent named this teacher
    expect(minor?.consentBy).toBeUndefined()
    expect(await docExists(`parentConsents/${w.minor.id}`)).toBe(false)
    await expectBystanderIntact(w)
  })
})

describe('who may delete', () => {
  it('needs the confirm flag and a signed-in person', async () => {
    const w = await buildWorld()
    expect(await errorCodeOf(callAs(w.adult.user, 'deleteMyAccount', {}))).toBe('functions/invalid-argument')
    expect(await errorCodeOf(callAs(w.adult.user, 'deleteMyAccount', { confirm: 'yes' }))).toBe('functions/invalid-argument')
    expect(await errorCodeOf(callAs(null, 'deleteMyAccount', { confirm: true }))).toBe('functions/unauthenticated')
    expect(await docExists(`users/${w.adult.id}`)).toBe(true)
  })

  it('adminDeleteUser: only the admin, never an admin, never oneself', async () => {
    const w = await buildWorld()
    for (const who of [w.teacher.user, w.adult.user, null]) {
      expect(await errorCodeOf(callAs(who, 'adminDeleteUser', { uid: w.adult.id }))).toMatch(/permission-denied|unauthenticated/)
    }
    expect(await docExists(`users/${w.adult.id}`)).toBe(true)
    expect(await errorCodeOf(callAs(admin, 'adminDeleteUser', { uid: admin.uid }))).toBe('functions/failed-precondition')
    const otherAdmin = await createUser({ claims: { admin: true } })
    expect(await errorCodeOf(callAs(admin, 'adminDeleteUser', { uid: otherAdmin.uid }))).toBe('functions/failed-precondition')
    expect(await errorCodeOf(callAs(admin, 'adminDeleteUser', { uid: 'a/b' }))).toBe('functions/invalid-argument')
    expect(await errorCodeOf(callAs(admin, 'adminDeleteUser', { uid: 'no-such-user' }))).toBe('functions/not-found')
  })

  it('adminDeleteUser deletes a person on request, and also finishes a half-done deletion', async () => {
    const w = await buildWorld()
    expect(await callAs(admin, 'adminDeleteUser', { uid: w.adult.id })).toEqual({ status: 'deleted' })
    expect(await docExists(`users/${w.adult.id}`)).toBe(false)
    expect(await authUserExists(w.adult.id)).toBe(false)
    await expectBystanderIntact(w)

    // a person whose data is already gone but whose sign-in still exists
    const leftover = await createUser({ provider: 'password' })
    expect(await callAs(admin, 'adminDeleteUser', { uid: leftover.uid })).toEqual({ status: 'deleted' })
    expect(await authUserExists(leftover.uid)).toBe(false)
  })

  it('adminLookupUser finds a person by e-mail; only for the admin', async () => {
    const w = await buildWorld()
    expect(await callAs(admin, 'adminLookupUser', { email: w.adult.user.email.toUpperCase() })).toMatchObject({
      found: true, uid: w.adult.id, name: 'בוגר', role: 'student', isAdmin: false,
    })
    expect(await callAs(admin, 'adminLookupUser', { email: 'nobody-here@example.com' })).toEqual({ found: false })
    expect(await errorCodeOf(callAs(w.teacher.user, 'adminLookupUser', { email: w.adult.user.email }))).toBe('functions/permission-denied')
    expect(await errorCodeOf(callAs(admin, 'adminLookupUser', { email: '' }))).toBe('functions/invalid-argument')
  })
})
