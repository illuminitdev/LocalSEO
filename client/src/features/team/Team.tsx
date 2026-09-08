import { useEffect, useState } from 'react';
import { Users, UserPlus } from 'lucide-react';
import { apiGet, apiPatch, apiPost } from '../../shared/utils';

export default function Team() {
    const [members, setMembers] = useState<any[]>([]);
    const [invites, setInvites] = useState<any[]>([]);
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('tech');
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [busy, setBusy] = useState(false);

    const load = async () => {
        try {
            const res = await apiGet('/api/host/team');
            setMembers(res.members || []);
            setInvites(res.invites || []);
        } catch (e: any) {
            setError(e.message);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const invite = async () => {
        setBusy(true);
        setError('');
        try {
            const res = await apiPost('/api/host/team/invites', { email, role });
            setInfo(res.link ? `Invite created: ${res.link}` : 'Invite sent');
            setEmail('');
            await load();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="w-full space-y-4 max-w-3xl">
            <div className="bg-[#0F172A] rounded-2xl text-white px-4 py-4 lg:px-6">
                <p className="text-xs text-white/50 uppercase tracking-widest">Booking Plots</p>
                <h1 className="font-black text-xl flex items-center gap-2">
                    <Users className="w-5 h-5" /> Team
                </h1>
                <p className="text-sm text-white/60 mt-1">Invite admins, dispatchers, and techs</p>
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
            {info && <p className="text-sm text-emerald-800 bg-emerald-50 rounded-xl px-4 py-2 break-all">{info}</p>}

            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 space-y-3">
                <h2 className="text-xs font-bold uppercase text-[#64748B] flex items-center gap-1">
                    <UserPlus className="w-3.5 h-3.5" /> Invite
                </h2>
                <div className="flex flex-wrap gap-2">
                    <input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email"
                        className="flex-1 min-w-[180px] rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                    />
                    <select
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        className="rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                    >
                        <option value="admin">Admin</option>
                        <option value="dispatcher">Dispatcher</option>
                        <option value="tech">Tech</option>
                    </select>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={invite}
                        className="rounded-xl bg-[#F59E0B] text-[#0F172A] px-4 py-2 text-sm font-bold"
                    >
                        Send invite
                    </button>
                </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
                <ul className="divide-y divide-[#F1F5F9]">
                    {members.map((m) => (
                        <li key={m.user_id || m.membership_id} className="px-4 py-3 flex justify-between gap-3 items-center">
                            <div>
                                <p className="font-bold text-sm">{m.name}</p>
                                <p className="text-xs text-[#64748B]">{m.email}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <select
                                    value={m.role}
                                    onChange={async (e) => {
                                        await apiPatch(`/api/host/team/members/${m.user_id || m.membership_id}`, {
                                            role: e.target.value,
                                            active: m.active !== false
                                        });
                                        load();
                                    }}
                                    className="rounded-lg border border-[#E2E8F0] px-2 py-1 text-xs"
                                >
                                    <option value="owner">Owner</option>
                                    <option value="admin">Admin</option>
                                    <option value="dispatcher">Dispatcher</option>
                                    <option value="tech">Tech</option>
                                </select>
                                <button
                                    type="button"
                                    className="text-xs font-bold text-[#64748B]"
                                    onClick={async () => {
                                        await apiPatch(`/api/host/team/members/${m.user_id || m.membership_id}`, {
                                            role: m.role,
                                            active: m.active === false
                                        });
                                        load();
                                    }}
                                >
                                    {m.active === false ? 'Activate' : 'Deactivate'}
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>

            {!!invites.length && (
                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4">
                    <h2 className="text-xs font-bold uppercase text-[#64748B] mb-2">Pending invites</h2>
                    <ul className="space-y-1 text-sm">
                        {invites.map((i) => (
                            <li key={i.id}>
                                {i.email} — {i.role}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
