import { Navigate, useLocation } from 'react-router-dom';
import { getToken } from '../lib/auth';

/** Protects app routes — redirects to login when no session token. */
export default function RequireAuth({ children }: { children: React.ReactNode }) {
    const location = useLocation();
    const token = getToken();

    if (!token) {
        const next = `${location.pathname}${location.search}`;
        const to = next && next !== '/' ? `/login?next=${encodeURIComponent(next)}` : '/login';
        return <Navigate to={to} replace />;
    }

    return <>{children}</>;
}
