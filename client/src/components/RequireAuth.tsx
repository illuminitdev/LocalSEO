import { Navigate, useLocation } from 'react-router-dom';
import { getMustChangePassword, getToken } from '../lib/auth';

/** Protects app routes — redirects to login when no session token. */
export default function RequireAuth({ children }: { children: React.ReactNode }) {
    const location = useLocation();
    const token = getToken();

    if (!token) {
        const next = `${location.pathname}${location.search}`;
        const to = next && next !== '/' && next !== '/login'
            ? `/?next=${encodeURIComponent(next)}`
            : '/';
        return <Navigate to={to} replace />;
    }

    if (getMustChangePassword() && location.pathname !== '/account') {
        return <Navigate to="/account?forcePassword=1" replace />;
    }

    return <>{children}</>;
}
