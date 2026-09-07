import { Navigate, useLocation } from 'react-router-dom';
import { getToken } from '../features/auth/auth';
import { getAdminToken } from '../features/admin/adminApi';

/** Protects app routes — redirects to login when no session token. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
    const location = useLocation();
    const token = getToken();

    if (!token) {
        const next = `${location.pathname}${location.search}`;
        const to =
            next && next !== '/' && next !== '/login' ? `/?next=${encodeURIComponent(next)}` : '/';
        return <Navigate to={to} replace />;
    }

    return <>{children}</>;
}

/** Protects admin routes — unauthenticated admins go to the shared login page. */
export function RequireAdmin({ children }: { children: React.ReactNode }) {
    const location = useLocation();
    const token = getAdminToken();

    if (!token) {
        const next = `${location.pathname}${location.search}`;
        const to =
            next && next.startsWith('/admin') ? `/?next=${encodeURIComponent(next)}` : '/';
        return <Navigate to={to} replace />;
    }

    return <>{children}</>;
}

export default RequireAuth;
