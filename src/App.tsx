import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import OnboardingPage from './pages/OnboardingPage';
import DashboardLayout from './components/layout/DashboardLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';

import AnnouncementsPage from './pages/AnnouncementsPage';
import DashboardHome from './pages/DashboardHome';
import AttendancePage from './pages/AttendancePage';
import TasksPage from './pages/TasksPage';
import StudentsPage from './pages/StudentsPage';
import FinancePage from './pages/FinancePage';
import PiketPage from './pages/PiketPage';
import GradebookPage from './pages/GradebookPage';
import GradeRecapPage from './pages/GradeRecapPage';

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/onboarding" element={
            <ProtectedRoute>
              <OnboardingPage />
            </ProtectedRoute>
          } />

          {/* Protected Dashboard Routes */}
          <Route path="/*" element={
            <ProtectedRoute>
              <DashboardLayout>
                <Routes>
                  <Route path="/dashboard" element={<DashboardHome />} />
                  <Route path="/attendance" element={
                    <ProtectedRoute allowedRoles={['guru']}>
                      <AttendancePage />
                    </ProtectedRoute>
                  } />
                  <Route path="/tasks" element={<TasksPage />} />
                  <Route path="/students" element={
                    <ProtectedRoute requireWaliKelas={true}>
                      <StudentsPage />
                    </ProtectedRoute>
                  } />
                  <Route path="/finance" element={<FinancePage />} />
                  <Route path="/piket" element={<PiketPage />} />
                  <Route path="/announcements" element={<AnnouncementsPage />} />
                  <Route path="/grades" element={
                    <ProtectedRoute allowedRoles={['guru']}>
                      <GradebookPage />
                    </ProtectedRoute>
                  } />
                  <Route path="/grades-recap" element={
                    <ProtectedRoute allowedRoles={['guru']}>
                      <GradeRecapPage />
                    </ProtectedRoute>
                  } />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </DashboardLayout>
            </ProtectedRoute>
          } />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
