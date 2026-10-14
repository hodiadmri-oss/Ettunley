import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectStorageEmulator, getStorage } from 'firebase/storage'

// Public web config (safe to ship in the client). Real values are filled in
// before the first deploy; local development uses the emulators only.
const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'demo-key',
  authDomain: 'ettunley-61749.firebaseapp.com',
  projectId: 'ettunley-61749',
  storageBucket: 'ettunley-61749.firebasestorage.app',
})

export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)

if (import.meta.env.DEV) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectStorageEmulator(storage, '127.0.0.1', 9199)
}
