import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/auth/AuthProvider'
import ChooseRole from '@/screens/ChooseRole'
import Home from '@/screens/Home'
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

  return (
    <Routes>
      <Route path="/home" element={<Home />} />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Router />
      </AuthProvider>
    </BrowserRouter>
  )
}
