import { useEffect, useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { apiGet, apiPost, cn } from '../../shared/utils';

export default function Inbox() {
    const [threads, setThreads] = useState<any[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [thread, setThread] = useState<any>(null);
    const [body, setBody] = useState('');
    const [error, setError] = useState('');
    const [smsConfigured, setSmsConfigured] = useState(false);
    const [busy, setBusy] = useState(false);

    const loadThreads = async () => {
        try {
            const res = await apiGet('/api/host/inbox');
            setThreads(res.threads || []);
            setSmsConfigured(Boolean(res.smsConfigured));
        } catch (e: any) {
            setError(e.message);
        }
    };

    const loadThread = async (id: string) => {
        setSelected(id);
        try {
            const res = await apiGet(`/api/host/inbox/${id}`);
            setThread(res.thread);
            setMessages(res.messages || []);
        } catch (e: any) {
            setError(e.message);
        }
    };

    useEffect(() => {
        loadThreads();
    }, []);

    const reply = async () => {
        if (!selected || !body.trim()) return;
        setBusy(true);
        try {
            await apiPost(`/api/host/inbox/${selected}/reply`, { body });
            setBody('');
            await loadThread(selected);
            await loadThreads();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="w-full space-y-4">
            <div className="bg-[#0F172A] rounded-2xl text-white px-4 py-4 lg:px-6">
                <p className="text-xs text-white/50 uppercase tracking-widest">Booking Plots</p>
                <h1 className="font-black text-xl flex items-center gap-2">
                    <MessageSquare className="w-5 h-5" /> Inbox
                </h1>
                <p className="text-sm text-white/60 mt-1">
                    Outbound SMS via AWS SNS
                    {smsConfigured ? '' : ' (not configured locally — Lambda has SNS publish IAM)'}
                </p>
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-[420px]">
                <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden lg:col-span-1">
                    {!threads.length ? (
                        <p className="p-6 text-sm text-[#64748B]">No conversations yet.</p>
                    ) : (
                        <ul className="divide-y divide-[#F1F5F9]">
                            {threads.map((t) => (
                                <li key={t.id}>
                                    <button
                                        type="button"
                                        onClick={() => loadThread(t.id)}
                                        className={cn(
                                            'w-full text-left px-4 py-3 hover:bg-[#F8FAFC]',
                                            selected === t.id && 'bg-[#FFFBEB]'
                                        )}
                                    >
                                        <p className="font-bold text-sm text-[#0F172A]">
                                            {t.customer_name || t.customer_phone}
                                        </p>
                                        <p className="text-xs text-[#64748B] truncate">{t.last_body || t.customer_phone}</p>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 lg:col-span-2 flex flex-col">
                    {!selected ? (
                        <p className="m-auto text-sm text-[#64748B]">Select a thread</p>
                    ) : (
                        <>
                            <p className="font-bold text-[#0F172A] mb-3">
                                {thread?.customer_name || thread?.customer_phone}
                            </p>
                            <div className="flex-1 space-y-2 overflow-y-auto max-h-[320px] mb-3">
                                {messages.map((m) => (
                                    <div
                                        key={m.id}
                                        className={cn(
                                            'rounded-xl px-3 py-2 text-sm max-w-[85%]',
                                            m.direction === 'outbound'
                                                ? 'ml-auto bg-[#0F172A] text-white'
                                                : 'bg-[#F1F5F9] text-[#0F172A]'
                                        )}
                                    >
                                        {m.body}
                                    </div>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <input
                                    value={body}
                                    onChange={(e) => setBody(e.target.value)}
                                    placeholder="Reply by SMS…"
                                    className="flex-1 rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                                />
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={reply}
                                    className="rounded-xl bg-[#F59E0B] text-[#0F172A] px-4 py-2 font-bold text-sm inline-flex items-center gap-1"
                                >
                                    <Send className="w-3.5 h-3.5" /> Send
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
