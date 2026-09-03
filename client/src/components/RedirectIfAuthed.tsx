import { Navigate, useSearchParams } from 'react-router-dom';
import { getToken } from '../lib/auth';
import { getAdminToken } from '../lib/adminAuth';

/** Sends already-signed-in users (portal or admin) away from the login page. */
export default function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
    const [params] = useSearchParams();
    const adminToken = getAdminToken();
    if (adminToken) {
        const next = params.get('next');
        return <Navigate to={next && next.startsWith('/admin') ? next : '/admin'} replace />;
    }
    const token = getToken();
    if (token) {
        const next = params.get('next');
        const safeNext =
            next && next.startsWith('/') && next !== '/' && next !== '/login' && !next.startsWith('/admin')
                ? next
                : '/dashboard';
        return <Navigate to={safeNext} replace />;
    }
    return <>{children}</>;
}
