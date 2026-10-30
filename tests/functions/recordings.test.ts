import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AdminTimestamp as Timestamp, adminBucket, adminDb, docData, docExists, fileExists } from './adminSdk'
import { callAs, createEnv, createUser, errorCodeOf } from './helpers'

let env: RulesTestEnvironment
let counter = 0

beforeAll(async () => {
  env = await createEnv()
})
afterAll(async () => {
  await env.cleanup()
})

async function world() {
  const n = counter++
  const now = Timestamp.now()
  const teacher = await createUser({ provider: 'google' })
  const student = await createUser({ provider: 'password' })
  const other = await createUser({ provider: 'password' })
  const T = teacher.uid, S = student.uid
  await adminDb().doc(`users/${T}`).set({ role: 'teacher', name: 'המורה', teacherStatus: 'approved', createdAt: now })
  await adminDb().doc(`users/${S}`).set({ role: 'student', name: 'תלמיד', teacherId: T, linkStatus: 'approved', consentAt: now, createdAt: now })
  const aid = `ra${n}`
  const path = `recordings/${S}/${aid}/i1`
  await adminDb().doc(`assignments/${aid}`).set({ teacherId: T, studentId: S, title: 'מטלה', dailyGoalMinutes: 10, createdAt: now })
  await adminDb().doc(`assignments/${aid}/items/i1`).set({
    position: 0, title: 'פריט', status: 'working', recording: { path, durationSeconds: 30, uploadedAt: now },
  })
  return { aid, path, teacher, student, other, S, T }
}

const waitFor = async (check: () => Promise<boolean>, ms = 15000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await check()) return true
    await new Promise((r) => setTimeout(r, 250))
  }
  return false
}

describe('deleteMyRecording', () => {
  it('removes the file and the mark on the item, for the student only', async () => {
    const w = await world()
    await adminBucket().file(w.path).save(Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(40)]), { contentType: 'audio/webm' })
    expect(await errorCodeOf(callAs(w.other, 'deleteMyRecording', { assignmentId: w.aid, itemId: 'i1' }))).toBe('functions/not-found')
    expect(await errorCodeOf(callAs(w.teacher, 'deleteMyRecording', { assignmentId: w.aid, itemId: 'i1' }))).toBe('functions/not-found')
    expect(await errorCodeOf(callAs(null, 'deleteMyRecording', { assignmentId: w.aid, itemId: 'i1' }))).toBe('functions/unauthenticated')
    expect(await errorCodeOf(callAs(w.student, 'deleteMyRecording', { assignmentId: '../x', itemId: 'i1' }))).toBe('functions/invalid-argument')
    expect(await fileExists(w.path)).toBe(true)

    expect(await callAs(w.student, 'deleteMyRecording', { assignmentId: w.aid, itemId: 'i1' })).toEqual({ status: 'deleted' })
    expect(await fileExists(w.path)).toBe(false)
    const item = await docData(`assignments/${w.aid}/items/i1`)
    expect('recording' in (item as object)).toBe(false)
    expect(item?.title).toBe('פריט')
    // again: nothing left, no error
    expect(await callAs(w.student, 'deleteMyRecording', { assignmentId: w.aid, itemId: 'i1' })).toEqual({ status: 'deleted' })
  })
})

describe('verifyUpload (runs after every upload)', () => {
  it('keeps a real recording', async () => {
    const w = await world()
    await adminBucket().file(w.path).save(Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(100)]), { contentType: 'audio/webm' })
    await new Promise((r) => setTimeout(r, 4000))
    expect(await fileExists(w.path)).toBe(true)
    expect((await docData(`assignments/${w.aid}/items/i1`))?.recording?.path).toBe(w.path)
  })

  it('deletes a file that is not audio and clears the mark on the item', async () => {
    const w = await world()
    await adminBucket().file(w.path).save(Buffer.from('<html><script>alert(1)</script></html>'), { contentType: 'audio/webm' })
    const gone = await waitFor(async () => !(await fileExists(w.path)))
    expect(gone).toBe(true)
    expect(await waitFor(async () => !('recording' in ((await docData(`assignments/${w.aid}/items/i1`)) as object)))).toBe(true)
  })

  // Removing the download token is not tested here: the emulator keeps its own copy of the token
  // and ignores the removal. It is checked on the real project instead (see docs/DEPLOY-TRIAL.md).
})

describe('recording alerts (a recording waits for the teacher)', () => {
  const alertPath = (aid: string) => `recordingAlerts/${aid}_i1`

  it('an alert exists for a recording that was not heard, and goes when the teacher listened', async () => {
    const w = await world()
    // the world() item already has a recording, written before the trigger ran; touch it
    await adminDb().doc(`assignments/${w.aid}/items/i1`).update({ title: 'פריט א' })
    expect(await waitFor(() => docExists(alertPath(w.aid)))).toBe(true)
    expect(await docData(alertPath(w.aid))).toMatchObject({
      teacherId: w.T, studentId: w.S, assignmentId: w.aid, itemId: 'i1', assignmentTitle: 'מטלה', itemTitle: 'פריט א',
    })

    await adminDb().doc(`assignments/${w.aid}/items/i1`).update({ recordingSeenAt: Timestamp.fromMillis(Date.now() + 1000) })
    expect(await waitFor(async () => !(await docExists(alertPath(w.aid))))).toBe(true)
  })

  it('a new recording after the teacher listened makes it waiting again', async () => {
    const w = await world()
    const ref = adminDb().doc(`assignments/${w.aid}/items/i1`)
    await ref.update({ recordingSeenAt: Timestamp.fromMillis(Date.now() + 1000) })
    await new Promise((r) => setTimeout(r, 1500))
    expect(await docExists(alertPath(w.aid))).toBe(false)
    await ref.update({ recording: { path: w.path, durationSeconds: 20, uploadedAt: Timestamp.fromMillis(Date.now() + 60000) } })
    expect(await waitFor(() => docExists(alertPath(w.aid)))).toBe(true)
  })

  it('goes when the student deletes the recording or the item disappears', async () => {
    const w = await world()
    const ref = adminDb().doc(`assignments/${w.aid}/items/i1`)
    await ref.update({ title: 'שינוי' })
    expect(await waitFor(() => docExists(alertPath(w.aid)))).toBe(true)
    await adminBucket().file(w.path).save(Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(40)]), { contentType: 'audio/webm' })
    await callAs(w.student, 'deleteMyRecording', { assignmentId: w.aid, itemId: 'i1' })
    expect(await waitFor(async () => !(await docExists(alertPath(w.aid))))).toBe(true)
  })

  it('removing the student takes their alerts away from the teacher', async () => {
    const w = await world()
    await adminDb().doc(`assignments/${w.aid}/items/i1`).update({ title: 'שוב' })
    expect(await waitFor(() => docExists(alertPath(w.aid)))).toBe(true)
    expect(await callAs(w.teacher, 'removeStudent', { studentId: w.S })).toEqual({ status: 'removed' })
    expect(await docExists(alertPath(w.aid))).toBe(false)
  })
})

describe('practice summary on the student profile', () => {
  it('adds each session to the day it ended, and never brings back a deleted student', async () => {
    const w = await world()
    const log = (seconds: number) => ({
      studentId: w.S, teacherId: w.T, assignmentId: w.aid, seconds, startedAt: Timestamp.now(), endedAt: Timestamp.now(),
    })
    await adminDb().collection('practiceLogs').add(log(120))
    await adminDb().collection('practiceLogs').add(log(30))
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    expect(await waitFor(async () => (await docData(`users/${w.S}`))?.practiceDays?.[today] === 150)).toBe(true)

    await adminDb().doc(`users/${w.S}`).delete()
    await adminDb().collection('practiceLogs').add(log(60))
    await new Promise((r) => setTimeout(r, 3000))
    expect(await docExists(`users/${w.S}`)).toBe(false)
  })
})
