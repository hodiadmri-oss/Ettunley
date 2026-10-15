import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { initializeApp } from 'firebase/app'
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
} from 'firebase/auth'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { doc, setDoc, Timestamp } from 'firebase/firestore'

export const PROJECT_ID = 'ettunley-61749'
const AUTH = 'http://127.0.0.1:9099'
let counter = 0

export interface TestUser {
  uid: string
  email: string
  provider: 'google' | 'password'
}

const authRest = async (path: string, body: object) => {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify(body),
  })
  return (await res.json()) as Record<string, string>
}

export interface UserOptions {
  provider?: 'google' | 'password'
  verified?: boolean
  claims?: Record<string, unknown>
}

// Creates a sign-in account in the Auth emulator.
export async function createUser(options: UserOptions = {}): Promise<TestUser> {
  const { provider = 'google', verified = true, claims } = options
  const email = `user${Date.now()}-${counter++}@example.com`
  let uid: string
  if (provider === 'google') {
    const idToken = JSON.stringify({ sub: email, email, email_verified: verified })
    const r = await authRest('accounts:signInWithIdp?key=x', {
      postBody: `id_token=${encodeURIComponent(idToken)}&providerId=google.com`,
      requestUri: 'http://localhost',
      returnIdpCredential: true,
      returnSecureToken: true,
    })
    uid = r.localId
  } else {
    const r = await authRest('accounts:signUp?key=x', { email, password: 'password-12345' })
    uid = r.localId
    if (verified) await authRest(`projects/${PROJECT_ID}/accounts:update`, { localId: uid, emailVerified: true })
  }
  if (claims) {
    await authRest(`projects/${PROJECT_ID}/accounts:update`, { localId: uid, customAttributes: JSON.stringify(claims) })
  }
  return { uid, email, provider }
}

// Calls a Cloud Function the way the app does, as the given person (or nobody).
export async function callAs(user: TestUser | null, name: string, data?: unknown): Promise<unknown> {
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: 'x' }, `app-${counter++}`)
  const auth = getAuth(app)
  connectAuthEmulator(auth, AUTH, { disableWarnings: true })
  if (user?.provider === 'google') {
    const idToken = JSON.stringify({ sub: user.email, email: user.email, email_verified: true })
    await signInWithCredential(auth, GoogleAuthProvider.credential(idToken))
  } else if (user) {
    await signInWithEmailAndPassword(auth, user.email, 'password-12345')
  }
  const functions = getFunctions(app, 'me-west1')
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
  const result = await httpsCallable(functions, name)(data)
  return result.data
}

export async function errorCodeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
    return 'no-error'
  } catch (e) {
    return (e as { code?: string }).code ?? String(e)
  }
}

export async function createEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({ projectId: PROJECT_ID, firestore: {} })
}

export async function putUserDoc(env: RulesTestEnvironment, uid: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `users/${uid}`), { name: 'שם', createdAt: Timestamp.now(), ...data })
  })
}

export async function readDoc(env: RulesTestEnvironment, path: string) {
  let data: Record<string, unknown> | undefined
  await env.withSecurityRulesDisabled(async (ctx) => {
    const { getDoc } = await import('firebase/firestore')
    const snap = await getDoc(doc(ctx.firestore(), path))
    data = snap.exists() ? (snap.data() as Record<string, unknown>) : undefined
  })
  return data
}

export async function putDoc(env: RulesTestEnvironment, path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data)
  })
}
