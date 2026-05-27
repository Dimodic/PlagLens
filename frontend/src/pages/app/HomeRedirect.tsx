/**
 * "/" — role-based redirect:
 *   admin     → /admin
 *   teacher   → /courses
 *   assistant → /grading (assistant cabinet / grading queue)
 *   student   → /me/assignments
 */
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';

export function HomeRedirect() {
  const { user, status } = useAuth();
  if (status !== 'authenticated' || !user) {
    return <Navigate to="/login" replace />;
  }
  switch (user.global_role) {
    case 'admin':
      return <Navigate to="/admin" replace />;
    case 'teacher':
      return <Navigate to="/courses" replace />;
    case 'assistant':
      return <Navigate to="/grading" replace />;
    case 'student':
    default:
      return <Navigate to="/me/assignments" replace />;
  }
}

export default HomeRedirect;
