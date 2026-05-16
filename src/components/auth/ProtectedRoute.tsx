import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/src/context/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: ('guru' | 'murid')[];
  requireWaliKelas?: boolean;
}

export default function ProtectedRoute({ children, allowedRoles, requireWaliKelas }: ProtectedRouteProps) {
  const { profile, user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-indigo-600 w-10 h-10" />
      </div>
    );
  }

  // Not authenticated via Supabase Auth
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Authenticated but no profile record found in database
  if (user && !profile && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  // Use class_id to check onboarding for students and wali kelas
  const needsOnboarding = profile?.role === 'murid' ? !profile.class_id : (profile?.is_wali_kelas && !profile.class_id);

  // Redirect to Onboarding if profile is incomplete
  if (profile && needsOnboarding && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  // Prevent multiple onboarding
  if (profile && !needsOnboarding && location.pathname === '/onboarding') {
    return <Navigate to="/dashboard" replace />;
  }

  // Role authorization
  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  // Wali Kelas specific check
  if (requireWaliKelas && !profile.is_wali_kelas) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
