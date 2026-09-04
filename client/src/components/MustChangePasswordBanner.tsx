import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { getMustChangePassword } from '../lib/auth';

/** Soft mandatory notice — does not block dashboard or other services. */
export default function MustChangePasswordBanner() {
    const location = useLocation();
    const [show, setShow] = useState(() => getMustChangePassword());

    useEffect(() => {
        setShow(getMustChangePassword());
    }, [location.pathname, location.search]);

    useEffect(() => {
        const sync = () => setShow(getMustChangePassword());
        window.addEventListener('localpulse-auth', sync);
        return () => window.removeEventListener('localpulse-auth', sync);
    }, []);

    if (!show) return null;

    return (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                Mandatory
            </span>
            <div className="flex items-start gap-2 min-w-0 flex-1">
                <KeyRound className="w-4 h-4 text-amber-800 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-950">
                    <span className="font-bold">Change your temporary password.</span>
                    {' '}You signed in with a ZappSites invite password — please set a new one when you can.
                </p>
            </div>
            <Link
                to="/account#password"
                className="shrink-0 inline-flex items-center px-3 py-1.5 rounded-lg bg-[#0F172A] text-white text-xs font-bold hover:bg-[#1E293B]"
            >
                Change password
            </Link>
        </div>
    );
}
