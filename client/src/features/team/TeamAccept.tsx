import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiPost } from '../../shared/utils';

export default function TeamAccept() {
    const [params] = useSearchParams();
    const token = params.get('token') || '';
    const [msg, setMsg] = useState('Accepting invite…');
    const [err, setErr] = useState('');

    useEffect(() => {
        if (!token) {
            setErr('Missing invite token');
            return;
        }
        apiPost('/api/auth/team/accept', { token })
            .then(() => setMsg('Invite accepted. Open Booking Plots to continue.'))
            .catch((e: any) => setErr(e.message || 'Could not accept invite'));
    }, [token]);

    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[#F8FAFC]">
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 max-w-md w-full text-center">
                <h1 className="font-black text-xl text-[#0F172A]">Team invite</h1>
                {err ? <p className="text-red-600 mt-3 text-sm">{err}</p> : <p className="text-[#64748B] mt-3 text-sm">{msg}</p>}
            </div>
        </div>
    );
}
