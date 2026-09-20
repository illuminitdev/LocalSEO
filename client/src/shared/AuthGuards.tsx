import { Navigate, useLocation } from 'react-router-dom';
import { getToken, isSalesAgent } from '../features/auth/auth';
import { getAdminToken } from '../admin/adminApi';


export function RequireAuth({ children }: { children: React.ReactNode }) {
    const location = useLocation();
    const token = getToken();

    if (!token) {
        const next = `${location.pathname}${location.search}`;
        const to =
            next && next !== '/' && next !== '/login' ? `/?next=${encodeURIComponent(next)}` : '/';
        return <Navigate to={to} replace />;
    }

    if (isSalesAgent() && !location.pathname.startsWith('/sales')) {
        return <Navigate to="/sales" replace />;
    }

    return <>{children}</>;
}


export function RequireSales({ children }: { children: React.ReactNode }) {
    const location = useLocation();
    const token = getToken();

    if (!token) {
        const next = `${location.pathname}${location.search}`;
        const to =
            next && next.startsWith('/sales') ? `/?next=${encodeURIComponent(next)}` : '/';
        return <Navigate to={to} replace />;
    }

    if (!isSalesAgent()) {
        return <Navigate to="/dashboard" replace />;
    }

    return <>{children}</>;
}


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
