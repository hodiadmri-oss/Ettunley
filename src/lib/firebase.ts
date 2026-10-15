import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'
import { connectStorageEmulator, getStorage } from 'firebase/storage'

// Public web config (safe to ship in the client). Real values are filled in
// before the first deploy; local development uses the emulators only.
export const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'demo-key',
  authDomain: 'ettunley-61749.firebaseapp.com',
  projectId: 'ettunley-61749',
  storageBucket: 'ettunley-61749.firebasestorage.app',
})

export const auth = getAuth(app)
// E-mails from Firebase (password reset) are sent in Hebrew.
auth.languageCode = 'he'
export const db = getFirestore(app)
export const storage = getStorage(app)
// Same region as the data (Tel Aviv).
export const functions = getFunctions(app, 'me-west1')

if (import.meta.env.DEV) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectStorageEmulator(storage, '127.0.0.1', 9199)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
}
