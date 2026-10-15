import { createHash } from 'node:crypto'
import { getFirestore } from 'firebase-admin/firestore'

export const HOUR_MS = 60 * 60 * 1000
export const DAY_MS = 24 * HOUR_MS

// Counts one attempt for `key` inside a window (one hour unless said otherwise). Returns false when the
// limit is already used up. The counters live in `rateLimits/*`, which no client
// can read or write (the security rules deny everything that is not listed).
export async function consumeAttempt(key: string, max: number, windowMs: number = HOUR_MS): Promise<boolean> {
  const db = getFirestore()
  const ref = db.doc(`rateLimits/${key}`)
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const now = Date.now()
    const data = snap.data()
    if (!data || now - (data.windowStart as number) > windowMs) {
      tx.set(ref, { count: 1, windowStart: now })
      return true
    }
    if ((data.count as number) >= max) return false
    tx.update(ref, { count: (data.count as number) + 1 })
    return true
  })
}

export async function resetAttempts(key: string): Promise<void> {
  await getFirestore().doc(`rateLimits/${key}`).delete()
}

// IP addresses are never stored as they are: only a hash is used as the key.
export function ipKey(ip: string | undefined): string | null {
  if (!ip) return null
  return `ip_${createHash('sha256').update(ip).digest('hex').slice(0, 32)}`
}
