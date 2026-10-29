// The Admin SDK talking to the emulators, for building test data and checking results
// without going through the security rules. It is loaded from the same copy the Cloud
// Functions use, so values such as Timestamp can be shared with the code under test.
import { createRequire } from 'node:module'
import { PROJECT_ID } from './helpers'

const requireFromFunctions = createRequire(new URL('../../functions/package.json', import.meta.url))
const { getApps, initializeApp } = requireFromFunctions('firebase-admin/app')
const { getAuth } = requireFromFunctions('firebase-admin/auth')
const { getFirestore, Timestamp, FieldValue } = requireFromFunctions('firebase-admin/firestore')
const { getStorage } = requireFromFunctions('firebase-admin/storage')

export { Timestamp as AdminTimestamp, FieldValue as AdminFieldValue }

export const BUCKET = 'ettunley-61749.firebasestorage.app'
const app = getApps()[0] ?? initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET })

export const adminDb = () => getFirestore(app)
export const adminBucket = () => getStorage(app).bucket(BUCKET)
export const adminAuth = () => getAuth(app)

// A file with a real WebM start, so the upload check (verifyUpload) accepts it as audio.
export const AUDIO_BYTES = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('test-audio-test-audio')])

export async function putFile(path: string, contentType = 'audio/webm') {
  await adminBucket().file(path).save(AUDIO_BYTES, { contentType })
}

export const fileExists = async (path: string) => (await adminBucket().file(path).exists())[0]
export const docExists = async (path: string) => (await adminDb().doc(path).get()).exists
export const docData = async (path: string) => (await adminDb().doc(path).get()).data()

export async function authUserExists(uid: string) {
  try {
    await adminAuth().getUser(uid)
    return true
  } catch {
    return false
  }
}
