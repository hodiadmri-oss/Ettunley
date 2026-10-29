import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AdminTimestamp as Timestamp, adminBucket, adminDb, docData, docExists, fileExists, putFile } from './adminSdk'
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

// A teacher with one confirmed student, an assignment with an item that has sheet music
// and a recording, and a template that uses another file.
async function world() {
  const n = counter++
  const db = adminDb()
  const now = Timestamp.now()
  const teacher = await createUser({ provider: 'google' })
  const student = await createUser({ provider: 'password' })
  const T = teacher.uid, S = student.uid
  await db.doc(`users/${T}`).set({ role: 'teacher', name: 'המורה', teacherStatus: 'approved', createdAt: now })
  await db.doc(`users/${S}`).set({
    role: 'student', name: 'תלמיד', isMinor: false, teacherId: T, linkStatus: 'approved', consentAt: now, createdAt: now,
  })
  const aid = `fa${n}`
  const sheet = `sheet-music/${T}/sheet${n}`
  const tplSheet = `sheet-music/${T}/tplsheet${n}`
  await adminBucket().file(sheet).save(Buffer.from('x'), { contentType: 'application/pdf', metadata: { metadata: { name: 'scale.pdf' } } })
  await adminBucket().file(tplSheet).save(Buffer.from('xy'), { contentType: 'image/png', metadata: { metadata: { name: 'tpl.png' } } })
  await db.doc(`assignments/${aid}`).set({ teacherId: T, studentId: S, title: 'מטלה למחיקה', dailyGoalMinutes: 10, createdAt: now })
  await db.doc(`assignments/${aid}/items/i1`).set({
    position: 0, title: 'פריט', status: 'working', sheetPath: sheet,
    recording: { path: `recordings/${S}/${aid}/i1`, durationSeconds: 5, uploadedAt: now },
  })
  await db.doc(`assignments/${aid}/items/i1/comments/c1`).set({ authorId: T, text: 'יפה', createdAt: now, readAt: null })
  await putFile(`recordings/${S}/${aid}/i1`)
  await db.doc(`practiceLogs/fl${n}`).set({ studentId: S, teacherId: T, assignmentId: aid, minutes: 10, startedAt: now, endedAt: now })
  await db.doc(`templates/ft${n}`).set({ teacherId: T, title: 'תבנית', dailyGoalMinutes: 10, createdAt: now })
  await db.doc(`templates/ft${n}/items/ti1`).set({ position: 0, title: 'סולם', sheetPath: tplSheet })
  return { n, aid, T, S, teacher, student, sheet, tplSheet }
}

describe('deleteAssignment', () => {
  it('removes the assignment, its items, replies, sheet music and recordings, but keeps practice minutes', async () => {
    const w = await world()
    expect(await callAs(w.teacher, 'deleteAssignment', { assignmentId: w.aid })).toEqual({ status: 'deleted' })
    expect(await docExists(`assignments/${w.aid}`)).toBe(false)
    expect(await docExists(`assignments/${w.aid}/items/i1`)).toBe(false)
    expect(await docExists(`assignments/${w.aid}/items/i1/comments/c1`)).toBe(false)
    expect(await fileExists(w.sheet)).toBe(false)
    expect(await fileExists(`recordings/${w.S}/${w.aid}/i1`)).toBe(false)
    expect(await docExists(`practiceLogs/fl${w.n}`)).toBe(true)
    // the template and its file are not touched
    expect(await docExists(`templates/ft${w.n}`)).toBe(true)
    expect(await fileExists(w.tplSheet)).toBe(true)
  })

  it("refuses another teacher, the student, a removed student's teacher and visitors", async () => {
    const w = await world()
    const otherTeacher = await createUser({ provider: 'google' })
    await adminDb().doc(`users/${otherTeacher.uid}`).set({ role: 'teacher', name: 'אחרת', teacherStatus: 'approved', createdAt: Timestamp.now() })
    expect(await errorCodeOf(callAs(otherTeacher, 'deleteAssignment', { assignmentId: w.aid }))).toBe('functions/not-found')
    expect(await errorCodeOf(callAs(w.student, 'deleteAssignment', { assignmentId: w.aid }))).toBe('functions/permission-denied')
    expect(await errorCodeOf(callAs(null, 'deleteAssignment', { assignmentId: w.aid }))).toBe('functions/unauthenticated')
    expect(await errorCodeOf(callAs(w.teacher, 'deleteAssignment', { assignmentId: '../x' }))).toBe('functions/invalid-argument')

    await adminDb().doc(`users/${w.S}`).update({ teacherId: null, linkStatus: null })
    expect(await errorCodeOf(callAs(w.teacher, 'deleteAssignment', { assignmentId: w.aid }))).toBe('functions/permission-denied')
    expect(await docExists(`assignments/${w.aid}`)).toBe(true)
    expect(await fileExists(w.sheet)).toBe(true)
  })

  it('a pending teacher cannot delete', async () => {
    const w = await world()
    await adminDb().doc(`users/${w.T}`).update({ teacherStatus: 'pending' })
    expect(await errorCodeOf(callAs(w.teacher, 'deleteAssignment', { assignmentId: w.aid }))).toBe('functions/permission-denied')
    expect(await docExists(`assignments/${w.aid}`)).toBe(true)
  })
})

describe('adminListFiles / adminRemoveFile', () => {
  it('lists a teacher’s files with name, size and where they are used', async () => {
    const w = await world()
    const result = (await callAs(admin, 'adminListFiles', { teacherUid: w.T })) as {
      files: { path: string; name: string; size: number; uses: { kind: string; title: string }[] }[]
    }
    const byPath = new Map(result.files.map((f) => [f.path, f]))
    expect(byPath.get(w.sheet)).toMatchObject({ name: 'scale.pdf', size: 1, uses: [{ kind: 'assignment', title: 'מטלה למחיקה' }] })
    expect(byPath.get(w.tplSheet)).toMatchObject({ name: 'tpl.png', size: 2, uses: [{ kind: 'template', title: 'תבנית' }] })
  })

  it('removes a file and clears every item that used it', async () => {
    const w = await world()
    expect(await callAs(admin, 'adminRemoveFile', { path: w.sheet })).toEqual({ status: 'removed', cleared: 1 })
    expect(await fileExists(w.sheet)).toBe(false)
    const item = await docData(`assignments/${w.aid}/items/i1`)
    expect(item).toBeDefined()
    expect('sheetPath' in (item as object)).toBe(false)
    expect(item?.title).toBe('פריט')
    // the other file is untouched
    expect(await fileExists(w.tplSheet)).toBe(true)
  })

  it('is for the owner only, and only for sheet-music paths', async () => {
    const w = await world()
    for (const caller of [w.teacher, w.student, null]) {
      expect(['functions/permission-denied', 'functions/unauthenticated']).toContain(await errorCodeOf(callAs(caller, 'adminListFiles', { teacherUid: w.T })))
      expect(['functions/permission-denied', 'functions/unauthenticated']).toContain(await errorCodeOf(callAs(caller, 'adminRemoveFile', { path: w.sheet })))
    }
    expect(await fileExists(w.sheet)).toBe(true)
    for (const bad of [`recordings/${w.S}/${w.aid}/i1`, 'sheet-music/', `sheet-music/${w.T}/../x`, 'users/x', 5]) {
      expect(await errorCodeOf(callAs(admin, 'adminRemoveFile', { path: bad }))).toBe('functions/invalid-argument')
    }
    expect(await fileExists(`recordings/${w.S}/${w.aid}/i1`)).toBe(true)
  })
})

describe('adminReadFile / adminListStudents', () => {
  it('lets the owner read a file (to check what was uploaded)', async () => {
    const w = await world()
    const result = (await callAs(admin, 'adminReadFile', { path: w.sheet })) as { name: string; contentType: string; dataBase64: string }
    expect(result.name).toBe('scale.pdf')
    expect(result.contentType).toBe('application/pdf')
    expect(Buffer.from(result.dataBase64, 'base64').toString()).toBe('x')
  })

  it('refuses files that are too large to send, missing files, other paths and everyone but the owner', async () => {
    const w = await world()
    const big = `sheet-music/${w.T}/big${w.n}`
    await adminBucket().file(big).save(Buffer.alloc(6 * 1024 * 1024 + 1), { contentType: 'application/pdf' })
    expect(await errorCodeOf(callAs(admin, 'adminReadFile', { path: big }))).toBe('functions/failed-precondition')
    expect(await errorCodeOf(callAs(admin, 'adminReadFile', { path: `sheet-music/${w.T}/none` }))).toBe('functions/not-found')
    expect(await errorCodeOf(callAs(admin, 'adminReadFile', { path: `recordings/${w.S}/${w.aid}/i1` }))).toBe('functions/invalid-argument')
    for (const caller of [w.teacher, w.student, null]) {
      expect(['functions/permission-denied', 'functions/unauthenticated']).toContain(await errorCodeOf(callAs(caller, 'adminReadFile', { path: w.sheet })))
    }
  })

  it('lists the students of a teacher by name, without e-mail, for the owner only', async () => {
    const w = await world()
    const result = (await callAs(admin, 'adminListStudents', { teacherUid: w.T })) as { students: Record<string, unknown>[] }
    expect(result.students).toEqual([{ name: 'תלמיד', instrument: '', isMinor: false, hasConsent: true, confirmed: true }])
    for (const caller of [w.teacher, w.student, null]) {
      expect(['functions/permission-denied', 'functions/unauthenticated']).toContain(await errorCodeOf(callAs(caller, 'adminListStudents', { teacherUid: w.T })))
    }
  })
})
