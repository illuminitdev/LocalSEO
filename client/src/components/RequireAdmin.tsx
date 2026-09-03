import { Navigate, useLocation } from 'react-router-dom';
import { getAdminToken } from '../lib/adminAuth';

/** Protects admin routes — unauthenticated admins go to the shared login page. */
export default function RequireAdmin({ children }: { children: React.ReactNode }) {
    const location = useLocation();
    const token = getAdminToken();

    if (!token) {
        const next = `${location.pathname}${location.search}`;
        const to =
            next && next.startsWith('/admin')
                ? `/?next=${encodeURIComponent(next)}`
                : '/';
        return <Navigate to={to} replace />;
    }

    return <>{children}</>;
}
