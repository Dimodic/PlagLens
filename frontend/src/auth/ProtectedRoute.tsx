/**
 * Wraps protected routes. Redirects to /login when anonymous.
 *
 * While auth is "loading" (bootstrap refresh) we render the SAME brand
 * mark — same glyph, size and centre — that the pre-paint HTML splash
 * (index.html) shows. That makes the reload sequence one continuous,
 * gently-pulsing logo instead of «spinner → wordmark → app». Background
 * is `bg-background` so it matches the already-themed page.
 */
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';
import { BrandMark } from '@/components/shell/BrandMark';

export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <BrandMark cropped className="h-11 w-auto animate-pulse" />
      </div>
    );
  }

  if (status === 'anonymous') {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return <Outlet />;
}
