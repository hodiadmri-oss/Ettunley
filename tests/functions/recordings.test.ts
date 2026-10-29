import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AdminTimestamp as Timestamp, adminBucket, adminDb, docData, fileExists } from './adminSdk'
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
