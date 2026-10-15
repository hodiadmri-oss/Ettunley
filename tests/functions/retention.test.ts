import { describe, expect, it } from 'vitest'
import { deleteExpiredRecordings } from '../../functions/src/retention'
import { AdminTimestamp as Timestamp, adminBucket, adminDb, docData, fileExists, putFile } from './adminSdk'

const DAY = 24 * 60 * 60 * 1000
let counter = 0

async function itemWithRecording(ageDays: number) {
  const n = counter++
  const aid = `ret${Date.now()}x${n}`
  const path = `recordings/retStudent/${aid}/i1`
  await putFile(path)
  await adminDb().doc(`assignments/${aid}`).set({ teacherId: 't', studentId: 'retStudent', title: 'x', dailyGoalMinutes: 5 })
  await adminDb().doc(`assignments/${aid}/items/i1`).set({
    position: 1, title: 'x', status: 'ready', recording: { path, durationSeconds: 30, uploadedAt: Timestamp.fromMillis(Date.now() - ageDays * DAY) },
  })
  return { aid, path }
}

const deps = () => ({ db: adminDb(), bucket: adminBucket() })

describe('recordings are deleted 12 months after the upload', () => {
  it('deletes the old ones (file and mark) and keeps the recent ones', async () => {
    const old = await itemWithRecording(400)
    const justUnder = await itemWithRecording(364)
    const fresh = await itemWithRecording(3)

    const { deleted } = await deleteExpiredRecordings(deps())
    expect(deleted).toBeGreaterThanOrEqual(1)

    expect(await fileExists(old.path)).toBe(false)
    expect((await docData(`assignments/${old.aid}/items/i1`))?.recording).toBeUndefined()
    // the rest of the item stays
    expect((await docData(`assignments/${old.aid}/items/i1`))?.title).toBe('x')

    expect(await fileExists(justUnder.path)).toBe(true)
    expect((await docData(`assignments/${justUnder.aid}/items/i1`))?.recording).toBeDefined()
    expect(await fileExists(fresh.path)).toBe(true)
  })

  it('running it again finds nothing more to do', async () => {
    await itemWithRecording(500)
    await deleteExpiredRecordings(deps())
    const second = await deleteExpiredRecordings(deps())
    expect(second.deleted).toBe(0)
  })

  it('also removes old files that no item points to (safety net)', async () => {
    const orphan = `recordings/retStudent/orphan${Date.now()}/i1`
    await putFile(orphan)
    expect((await deleteExpiredRecordings(deps())).deleted).toBe(0)
    expect(await fileExists(orphan)).toBe(true)
    // a year and a month later the same file counts as old
    await deleteExpiredRecordings({ ...deps(), nowMs: Date.now() + 400 * DAY })
    expect(await fileExists(orphan)).toBe(false)
  })
})
