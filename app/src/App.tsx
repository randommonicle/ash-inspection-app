import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { App as CapApp } from '@capacitor/app'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { LoadingSpinner } from './components/LoadingSpinner'
import { LoginScreen } from './screens/LoginScreen'
import { RegisterScreen } from './screens/RegisterScreen'
import { PropertyListScreen } from './screens/PropertyListScreen'
import { PropertyDetailScreen } from './screens/PropertyDetailScreen'
import { ActiveInspectionScreen } from './screens/ActiveInspectionScreen'
import { UpdatePrompt } from './components/UpdatePrompt'
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
  const { session, loading } = useAuth()
  const { updateInfo, dismiss } = useUpdateCheck()

  useEffect(() => {
    if (session) {
      initDatabase().catch(console.error)
    }
  }, [session])

  if (loading) return <LoadingSpinner />

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
