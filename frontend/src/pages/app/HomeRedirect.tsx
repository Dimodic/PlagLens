/**
 * "/" — role-based redirect:
 *   admin/super_admin → /admin
 *   teacher           → /courses
 *   student           → /me/assignments
 */
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';

export function HomeRedirect() {
  const { user, status } = useAuth();
  if (status !== 'authenticated' || !user) {
    return <Navigate to="/login" replace />;
  }
  switch (user.global_role) {
    case 'super_admin':
    case 'admin':
      return <Navigate to="/admin" replace />;
    case 'teacher':
      return <Navigate to="/courses" replace />;
    case 'student':
    default:
      return <Navigate to="/me/assignments" replace />;
  }
}

export default HomeRedirect;
