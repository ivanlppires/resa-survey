import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { AuthProvider, useAuth } from './lib/auth'
import { ProtectedRoute } from './components/ProtectedRoute'
import InstallPrompt from './components/InstallPrompt'
import LoginPage from './pages/LoginPage'
import SurveyListPage from './pages/SurveyListPage'
import NewSurveyPage from './pages/NewSurveyPage'
import SurveyPage from './pages/SurveyPage'
import AdminDashboardPage from './pages/AdminDashboardPage'

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}

function HomeRedirect() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'admin') return <Navigate to="/admin" replace />
  return <SurveyListPage />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/admin" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />
          <Route path="/survey/new" element={<ProtectedRoute><NewSurveyPage /></ProtectedRoute>} />
          <Route path="/survey/:localId" element={<ProtectedRoute><SurveyPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <InstallPrompt />
      </AuthProvider>
    </BrowserRouter>
  )
}
