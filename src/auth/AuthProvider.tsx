import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { auth } from '@/lib/firebase'
import { authErrorMessage } from '@/lib/authErrors'
import { cleanName, createProfile, loadProfile, type Profile, type Role } from './profile'

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'needsProfile'; user: User }
  | { status: 'ready'; user: User; profile: Profile }

interface SignupIntent {
  role: Role
  name: string
}

interface AuthApi {
  state: AuthState
  /** Message of the last failed attempt, in Hebrew. */
  error: string | null
  clearError: () => void
  signUpWithEmail: (name: string, email: string, password: string) => Promise<void>
  signUpWithGoogle: (role: Role) => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  /** True when the request went through. Never reveals whether the e-mail has an account. */
  sendPasswordReset: (email: string) => Promise<boolean>
  completeProfile: (role: Role, name: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthApi | null>(null)

export function useAuth(): AuthApi {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}

export function isGoogleUser(user: User): boolean {
  return user.providerData.some((p) => p.providerId === 'google.com')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const [error, setError] = useState<string | null>(null)
  // What the person chose on the sign-up screen, used when the new account appears.
  const intent = useRef<SignupIntent | null>(null)

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ status: 'signedOut' })
        return
      }
      setState({ status: 'loading' })
      try {
        const existing = await loadProfile(user.uid)
        if (existing) {
          intent.current = null
          setState({ status: 'ready', user, profile: existing })
          return
        }
        const chosen = intent.current
        intent.current = null
        if (chosen) {
          const name = cleanName(chosen.name) || cleanName(user.displayName) || 'משתמש/ת'
          const profile = await createProfile(user.uid, chosen.role, name)
          setState({ status: 'ready', user, profile })
        } else {
          setState({ status: 'needsProfile', user })
        }
      } catch {
        setError('לא הצלחנו להשלים את ההרשמה. אפשר לנסות שוב.')
        setState({ status: 'needsProfile', user })
      }
    })
  }, [])

  const run = useCallback(async (action: () => Promise<unknown>) => {
    setError(null)
    try {
      await action()
    } catch (e) {
      intent.current = null
      setError(authErrorMessage((e as { code?: string }).code))
    }
  }, [])

  const api = useMemo<AuthApi>(
    () => ({
      state,
      error,
      clearError: () => setError(null),
      signUpWithEmail: (name, email, password) =>
        run(async () => {
          // Only students can sign up with e-mail; teachers use Google.
          intent.current = { role: 'student', name }
          const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
          await updateProfile(cred.user, { displayName: cleanName(name) })
        }),
      signUpWithGoogle: (role) =>
        run(async () => {
          intent.current = { role, name: '' }
          await signInWithPopup(auth, new GoogleAuthProvider())
        }),
      signInWithEmail: (email, password) =>
        run(() => signInWithEmailAndPassword(auth, email.trim(), password)),
      signInWithGoogle: () => run(() => signInWithPopup(auth, new GoogleAuthProvider())),
      sendPasswordReset: async (email) => {
        setError(null)
        try {
          await sendPasswordResetEmail(auth, email.trim())
          return true
        } catch (e) {
          const code = (e as { code?: string }).code
          // Same answer whether or not the account exists.
          if (code === 'auth/user-not-found') return true
          setError(authErrorMessage(code))
          return false
        }
      },
      completeProfile: (role, name) =>
        run(async () => {
          const user = auth.currentUser
          if (!user) return
          const profile = await createProfile(user.uid, role, cleanName(name) || 'משתמש/ת')
          setState({ status: 'ready', user, profile })
        }),
      signOut: () => run(() => firebaseSignOut(auth)),
    }),
    [state, error, run],
  )

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>
}
