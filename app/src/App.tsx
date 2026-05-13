import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { App as CapApp } from '@capacitor/app'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { LoadingSpinner } from './components/LoadingSpinner'
import { LoginScreen } from './screens/LoginScreen'
import { RegisterScreen } from './screens/RegisterScreen'
import { PropertyListScreen } from './screens/PropertyListScreen'
import { PropertyDetailScreen } from './screens/PropertyDetailScreen'
import { ActiveInspectionScreen } from './screens/ActiveInspectionScreen'
import { MyReportsScreen } from './screens/MyReportsScreen'
import { UpdatePrompt } from './components/UpdatePrompt'
import { SignatureCapture } from './components/SignatureCapture'
import { useUpdateCheck } from './hooks/useUpdateCheck'
import { initDatabase } from './db/database'

function BackButtonHandler() {
  const navigate   = useNavigate()
  const location   = useLocation()

  useEffect(() => {
    const handler = CapApp.addListener('backButton', () => {
      const roots = ['/properties', '/login', '/register']
      if (roots.includes(location.pathname)) {
        CapApp.exitApp()
      } else {
        navigate(-1)
      }
    })
    return () => { handler.then((h: { remove: () => void }) => h.remove()) }
  }, [location.pathname, navigate])

  return null
}

function AppRoutes() {
  const { session, profile, loading } = useAuth()
  const { updateInfo, dismiss } = useUpdateCheck()
  // Local override so the gate dismisses immediately on save — avoids waiting
  // for the profile re-fetch round-trip before letting the inspector through.
  const [signatureJustSaved, setSignatureJustSaved] = useState(false)

  useEffect(() => {
    if (session) {
      initDatabase().catch(console.error)
    }
  }, [session])

  // Reset the local override whenever the session changes so a fresh login
  // re-runs the gate based on the new profile.
  useEffect(() => { setSignatureJustSaved(false) }, [session?.user.id])

  if (loading) return <LoadingSpinner />

  // First-time signature gate — blocks everything until the inspector has
  // drawn and saved a signature. We only know whether one exists once the
  // profile has loaded; the LoadingSpinner above covers the brief gap.
  const needsSignature = session && profile && !profile.signature_path && !signatureJustSaved
  if (needsSignature) {
    return (
      <SignatureCapture onComplete={() => setSignatureJustSaved(true)} />
    )
  }

  return (
    <BrowserRouter>
      <BackButtonHandler />
      {/* Update prompt — only shown when logged in so it never blocks the login screen */}
      {session && updateInfo && (
        <UpdatePrompt info={updateInfo} onDismiss={dismiss} />
      )}
      <Routes>
        <Route
          path="/login"
          element={session ? <Navigate to="/properties" replace /> : <LoginScreen />}
        />
        <Route
          path="/register"
          element={session ? <Navigate to="/properties" replace /> : <RegisterScreen />}
        />
        <Route
          path="/properties"
          element={session ? <PropertyListScreen /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/properties/:id"
          element={session ? <PropertyDetailScreen /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/inspection/:inspectionId"
          element={session ? <ActiveInspectionScreen /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/my-reports"
          element={session ? <MyReportsScreen /> : <Navigate to="/login" replace />}
        />
        <Route
          path="*"
          element={<Navigate to={session ? '/properties' : '/login'} replace />}
        />
      </Routes>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
