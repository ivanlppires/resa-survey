import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { AuthProvider } from './lib/auth'
import { ProtectedRoute } from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import SurveyListPage from './pages/SurveyListPage'
import NewSurveyPage from './pages/NewSurveyPage'
import SurveyPage from './pages/SurveyPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ProtectedRoute><SurveyListPage /></ProtectedRoute>} />
          <Route path="/survey/new" element={<ProtectedRoute><NewSurveyPage /></ProtectedRoute>} />
          <Route path="/survey/:localId" element={<ProtectedRoute><SurveyPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
