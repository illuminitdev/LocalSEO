import { Navigate, useSearchParams } from 'react-router-dom';
import { getToken } from '../lib/auth';

/** Sends already-signed-in users away from login/register. */
export default function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
    const [params] = useSearchParams();
    const token = getToken();
    if (token) {
        const next = params.get('next');
        return <Navigate to={next && next.startsWith('/') ? next : '/'} replace />;
    }
    return <>{children}</>;
}
