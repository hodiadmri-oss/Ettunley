import type { Bucket, File } from '@google-cloud/storage'
import { FieldValue, getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { STORAGE_BUCKET } from './config'

const RETENTION_DAYS = 365
const PAGE = 200

// Recordings are kept 12 months from the upload and then deleted: the file and the
// mark on the item. Users are told this at sign-up and in the privacy notice.
export async function deleteExpiredRecordings(
  deps: { db?: Firestore; bucket?: Bucket; nowMs?: number } = {},
): Promise<{ deleted: number }> {
  const cutoffMs = (deps.nowMs ?? Date.now()) - RETENTION_DAYS * 24 * 60 * 60 * 1000
  const db = deps.db ?? getFirestore()
  const bucket = deps.bucket ?? getStorage().bucket(STORAGE_BUCKET)
  let deleted = 0

  // 1. Every item whose recording is older than the cutoff.
  for (;;) {
    const snap = await db
      .collectionGroup('items')
      .where('recording.uploadedAt', '<', Timestamp.fromMillis(cutoffMs))
      .limit(PAGE)
      .get()
    if (snap.empty) break
    for (const item of snap.docs) {
      const path = item.data().recording?.path
      if (typeof path === 'string') await bucket.file(path).delete({ ignoreNotFound: true })
      await item.ref.update({ recording: FieldValue.delete() })
      deleted++
    }
  }

  // 2. Safety net: files that no item points to any more but are old anyway.
  let pageToken: string | undefined
  do {
    const [files, next] = (await bucket.getFiles({
      prefix: 'recordings/',
      maxResults: 500,
      autoPaginate: false,
      pageToken,
    })) as unknown as [File[], { pageToken?: string } | null]
    for (const file of files) {
      const created = Date.parse(String(file.metadata.timeCreated))
      if (!Number.isNaN(created) && created < cutoffMs) {
        await file.delete({ ignoreNotFound: true })
        deleted++
      }
    }
    pageToken = next?.pageToken
  } while (pageToken)

  return { deleted }
}

export const dailyRetention = onSchedule(
  { schedule: 'every day 03:00', timeZone: 'Asia/Jerusalem', timeoutSeconds: 540 },
  async () => {
    await deleteExpiredRecordings()
  },
)
