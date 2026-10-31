import { initializeApp } from 'firebase/app'
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
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

// App Check: every request carries a short-lived proof from Google (Google Cloud Fraud Defense, formerly reCAPTCHA Enterprise) that it comes
// from this site. The site key is public (it is in every page that uses it). Not used in local development, where the emulators run.
// Requests are checked by the servers only once enforcement is switched on in the console.
const RECAPTCHA_SITE_KEY = '6LdXOgouAAAAAOJmDCS3wQm56yqEihNuXoO7bzrI'
if (!import.meta.env.DEV) {
  initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true })
}

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
