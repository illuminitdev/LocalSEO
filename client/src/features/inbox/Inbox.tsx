import { useEffect, useState } from 'react';
import { Send, Search, Phone, User, X } from 'lucide-react';
import { apiGet, apiPost, cn } from '../../shared/utils';

export default function Inbox() {
    const [threads, setThreads] = useState<any[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [thread, setThread] = useState<any>(null);
    const [body, setBody] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'clients' | 'team'>('all');

    const loadThreads = async () => {
        try {
            const res = await apiGet('/api/host/inbox');
            setThreads(res.threads || []);
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

    const filteredThreads = threads.filter((t) => {
        const matchesSearch =
            (t.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (t.customer_phone || '').includes(searchTerm) ||
            (t.last_body || '').toLowerCase().includes(searchTerm.toLowerCase());

        if (!matchesSearch) return false;
        if (activeTab === 'unread') return t.unread_count > 0;
        if (activeTab === 'team') return t.type === 'team';
        if (activeTab === 'clients') return t.type !== 'team';
        return true;
    });

    return (
        <div className="w-full max-w-7xl mx-auto space-y-5 pb-10">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">Inbox</h1>
                <p className="text-sm font-medium text-slate-500 mt-1">Outbound SMS</p>
            </div>

            {/* Error Notification */}
            {error && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between">
                    <span>{error}</span>
                    <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Main Split Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[560px] items-stretch">
                {/* Left Panel: Conversations List */}
                <div className="lg:col-span-4 bg-white border border-slate-200/90 rounded-2xl shadow-sm flex flex-col overflow-hidden">
                    {/* Top: Search & Tabs */}
                    <div className="p-4 border-b border-slate-100 space-y-3">
                        {/* Search Bar */}
                        <div className="relative flex items-center bg-slate-50/80 border border-slate-200/80 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-orange-500/20 focus-within:border-[#FF7A00] transition">
                            <Search className="w-4 h-4 text-slate-400 shrink-0 mr-2" />
                            <input
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search conversations..."
                                className="w-full bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
                            />
                            {searchTerm && (
                                <button onClick={() => setSearchTerm('')} className="text-slate-400 hover:text-slate-600">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        {/* Filter Tabs */}
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => setActiveTab('all')}
                                className={cn(
                                    'px-3.5 py-1.5 rounded-lg text-xs font-bold transition',
                                    activeTab === 'all'
                                        ? 'bg-[#FFEDD5] text-[#C2410C]'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                )}
                            >
                                All
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('unread')}
                                className={cn(
                                    'px-3.5 py-1.5 rounded-lg text-xs font-semibold transition',
                                    activeTab === 'unread'
                                        ? 'bg-[#FFEDD5] text-[#C2410C] font-bold'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                )}
                            >
                                Unread
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('clients')}
                                className={cn(
                                    'px-3.5 py-1.5 rounded-lg text-xs font-semibold transition',
                                    activeTab === 'clients'
                                        ? 'bg-[#FFEDD5] text-[#C2410C] font-bold'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                )}
                            >
                                Clients
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('team')}
                                className={cn(
                                    'px-3.5 py-1.5 rounded-lg text-xs font-semibold transition',
                                    activeTab === 'team'
                                        ? 'bg-[#FFEDD5] text-[#C2410C] font-bold'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                )}
                            >
                                Team
                            </button>
                        </div>
                    </div>

                    {/* Conversation List / Empty State */}
                    <div className="flex-1 flex flex-col overflow-y-auto">
                        {filteredThreads.length === 0 ? (
                            <div className="m-auto p-8 text-center flex flex-col items-center justify-center">
                                <div className="w-14 h-14 rounded-full bg-slate-100/90 text-slate-500 flex items-center justify-center mb-3.5">
                                    <svg
                                        className="w-6 h-6"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                        <line x1="9" y1="10" x2="15" y2="10" />
                                    </svg>
                                </div>
                                <h3 className="font-bold text-slate-900 text-sm sm:text-base">No conversations yet</h3>
                                <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-[220px] leading-relaxed">
                                    When you send or receive an SMS, it will appear here.
                                </p>
                            </div>
                        ) : (
                            <ul className="divide-y divide-slate-100">
                                {filteredThreads.map((t) => (
                                    <li key={t.id}>
                                        <button
                                            type="button"
                                            onClick={() => loadThread(t.id)}
                                            className={cn(
                                                'w-full text-left px-4 py-3.5 hover:bg-slate-50/80 transition flex items-start gap-3',
                                                selected === t.id && 'bg-amber-50/60 border-l-4 border-[#FF7A00]'
                                            )}
                                        >
                                            <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 text-xs font-bold">
                                                {(t.customer_name?.[0] || 'C').toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-1">
                                                    <p className="font-bold text-sm text-slate-900 truncate">
                                                        {t.customer_name || t.customer_phone}
                                                    </p>
                                                    {t.updated_at && (
                                                        <span className="text-[11px] text-slate-400 shrink-0">
                                                            {new Date(t.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-slate-500 truncate mt-0.5">
                                                    {t.last_body || t.customer_phone}
                                                </p>
                                            </div>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                {/* Right Panel: Thread Conversation View */}
                <div className="lg:col-span-8 bg-white border border-slate-200/90 rounded-2xl shadow-sm flex flex-col overflow-hidden">
                    {!selected ? (
                        /* Empty State when no thread is selected */
                        <div className="m-auto p-8 text-center flex flex-col items-center justify-center">
                            <div className="relative w-28 h-20 mb-3 flex items-center justify-center">
                                {/* Back Slate Bubble */}
                                <svg
                                    className="absolute -left-1 top-0 w-14 h-14"
                                    viewBox="0 0 64 64"
                                    fill="none"
                                >
                                    <path
                                        d="M12 10C7.58 10 4 13.58 4 18v20c0 4.42 3.58 8 8 8h6v8l10-8h16c4.42 0 8-3.58 8-8V18c0-4.42-3.58-8-8-8H12z"
                                        fill="#E2E8F0"
                                    />
                                </svg>
                                {/* Front Warm Orange Bubble with 3 dots */}
                                <svg
                                    className="absolute right-0 bottom-0 w-16 h-16"
                                    viewBox="0 0 80 80"
                                    fill="none"
                                >
                                    <path
                                        d="M20 16C13.37 16 8 21.37 8 28v20c0 6.63 5.37 12 12 12h20l14 10v-10h6c6.63 0 12-5.37 12-12V28c0-6.63-5.37-12-12-12H20z"
                                        fill="#FED7AA"
                                    />
                                    {/* 3 Dots */}
                                    <circle cx="28" cy="38" r="3" fill="#EA580C" />
                                    <circle cx="38" cy="38" r="3" fill="#EA580C" />
                                    <circle cx="48" cy="38" r="3" fill="#EA580C" />
                                </svg>
                            </div>
                            <h2 className="text-xl font-bold text-slate-900 mb-1.5">Select a thread</h2>
                            <p className="text-sm text-slate-500 max-w-sm leading-relaxed">
                                Choose a conversation from the left to view messages and client details.
                            </p>
                        </div>
                    ) : (
                        /* Thread View with messages */
                        <div className="flex flex-col h-full">
                            {/* Thread Header */}
                            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-orange-100 text-[#FF7A00] flex items-center justify-center font-bold text-sm">
                                        <User className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-900 text-base">
                                            {thread?.customer_name || thread?.customer_phone || 'Client'}
                                        </h3>
                                        {thread?.customer_phone && (
                                            <p className="text-xs text-slate-500 flex items-center gap-1">
                                                <Phone className="w-3 h-3" /> {thread.customer_phone}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSelected(null)}
                                    className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Message History */}
                            <div className="flex-1 p-5 space-y-3 overflow-y-auto max-h-[420px] bg-slate-50/50">
                                {messages.length === 0 ? (
                                    <p className="text-center text-xs text-slate-400 my-8">No message history yet</p>
                                ) : (
                                    messages.map((m) => (
                                        <div
                                            key={m.id}
                                            className={cn(
                                                'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-2xs',
                                                m.direction === 'outbound'
                                                    ? 'ml-auto bg-[#FF7A00] text-white rounded-br-xs'
                                                    : 'mr-auto bg-white border border-slate-200 text-slate-800 rounded-bl-xs'
                                            )}
                                        >
                                            <p className="leading-relaxed">{m.body}</p>
                                            {m.created_at && (
                                                <p
                                                    className={cn(
                                                        'text-[10px] mt-1 text-right',
                                                        m.direction === 'outbound' ? 'text-white/80' : 'text-slate-400'
                                                    )}
                                                >
                                                    {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Bottom SMS Reply Bar */}
                            <div className="p-4 border-t border-slate-100 bg-white">
                                <div className="flex items-center gap-2">
                                    <input
                                        value={body}
                                        onChange={(e) => setBody(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                reply();
                                            }
                                        }}
                                        placeholder="Reply by SMS…"
                                        className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-[#FF7A00] transition"
                                    />
                                    <button
                                        type="button"
                                        disabled={busy || !body.trim()}
                                        onClick={reply}
                                        className="rounded-xl bg-[#FF7A00] hover:bg-[#E66E00] text-white px-5 py-2.5 font-bold text-sm inline-flex items-center gap-1.5 transition shadow-sm hover:shadow disabled:opacity-50 cursor-pointer active:scale-95"
                                    >
                                        <Send className="w-4 h-4" /> {busy ? 'Sending...' : 'Send'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
