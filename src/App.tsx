import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useState } from 'react'
import { AuthProvider, useAuth } from '@/auth/AuthProvider'
import { isOnboardingComplete } from '@/auth/profile'
import Admin from '@/screens/Admin'
import ConsentApprove from '@/screens/ConsentApprove'
import ChooseRole from '@/screens/ChooseRole'
import Home from '@/screens/Home'
import Onboarding from '@/screens/Onboarding'
import ResetPassword from '@/screens/ResetPassword'
import SignIn from '@/screens/SignIn'
import SignUp from '@/screens/SignUp'
import Welcome from '@/screens/Welcome'

function Loading() {
  return (
    <main className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <p className="text-lg text-ink/60">רגע...</p>
    </main>
  )
}

// Decides where a person belongs, based only on their sign-in state.
function Router() {
  const { state } = useAuth()
  // Decided once per person: if onboarding is needed it stays on screen until they
  // press "סיום", so they can read the notices even after the last field was saved.
  const [onboarding, setOnboarding] = useState<{ uid: string; active: boolean } | null>(null)

  if (state.status === 'loading') return <Loading />

  if (state.status === 'signedOut') {
    return (
      <Routes>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/login" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/reset" element={<ResetPassword />} />
        <Route path="*" element={<Navigate to="/welcome" replace />} />
      </Routes>
    )
  }

  if (state.status === 'needsProfile') {
    return (
      <Routes>
        <Route path="/choose-role" element={<ChooseRole />} />
        <Route path="*" element={<Navigate to="/choose-role" replace />} />
      </Routes>
    )
  }

  if (state.status === 'adminOnly') {
    return (
      <Routes>
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    )
  }

  const uid = state.user.uid
  if (onboarding?.uid !== uid) {
    setOnboarding({ uid, active: !isOnboardingComplete(state.profile) })
    return <Loading />
  }
  if (onboarding.active) {
    return <Onboarding onDone={() => setOnboarding({ uid, active: false })} />
  }

  return (
    <Routes>
      <Route path="/home" element={<Home />} />
      {state.isAdmin && <Route path="/admin" element={<Admin />} />}
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public page for parents: needs no account. */}
        <Route path="/consent/*" element={<ConsentApprove />} />
        <Route
          path="*"
          element={
            <AuthProvider>
              <Router />
            </AuthProvider>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
