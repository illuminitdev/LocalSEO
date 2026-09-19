import { useEffect, useRef, useState, useCallback } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, LogOut, Menu, UserRound, X, Bell, CheckSquare, PhoneCall, Users, CheckCheck, Clock, Shield } from 'lucide-react';
import { apiGet, cn } from '../../shared/utils';
import { clearToken } from '../auth/auth';

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 380;
const SIDEBAR_DEFAULT = 260;

const NAV_GROUPS = [
    {
        section: 'WORK & PIPELINE',
        items: [
            { name: 'Dashboard', to: '/sales', icon: LayoutDashboard, end: true },
            { name: 'Customers', to: '/sales/customers', icon: Users, end: true },
            { name: 'Tasks', to: '/sales/tasks', icon: CheckSquare, end: true },
            { name: 'Self Reminders', to: '/sales/reminders', icon: Bell, end: true },
            { name: 'Call Logs', to: '/sales/calls', icon: PhoneCall, end: true }
        ]
    },
    {
        section: 'ACCOUNT',
        items: [{ name: 'Account', to: '/sales/account', icon: UserRound, end: true }]
    }
];

interface SalesNotificationItem {
    id: string;
    title: string;
    subtitle: string;
    time: string;
    type: 'due_task' | 'admin_task' | 'reminder';
    link: string;
    read: boolean;
}

export default function SalesLayout() {
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [navOpen, setNavOpen] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        try {
            const n = Number(localStorage.getItem('lp.sidebarWidth.sales'));
            if (Number.isFinite(n)) return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(n)));
        } catch {  }
        return SIDEBAR_DEFAULT;
    });
    const [resizing, setResizing] = useState(false);
    const resizeRef = useRef<{ startX: number; startW: number } | null>(null);

    // Notifications State & Dropdown
    const [notifications, setNotifications] = useState<SalesNotificationItem[]>([]);
    const [notifOpen, setNotifOpen] = useState(false);
    const notifRef = useRef<HTMLDivElement | null>(null);

    const loadNotifications = useCallback(async () => {
        try {
            const data = await apiGet('/api/sales/tasks');
            const taskList = Array.isArray(data?.tasks) ? data.tasks : [];
            const readSet = new Set<string>();
            try {
                const stored = localStorage.getItem('lp.sales.readNotifs');
                if (stored) {
                    JSON.parse(stored).forEach((id: string) => readSet.add(String(id)));
                }
            } catch {  }

            const now = new Date();
            const items: SalesNotificationItem[] = taskList
                .filter((t: any) => t.status !== 'completed' && t.status !== 'cancelled')
                .slice(0, 15)
                .map((t: any) => {
                    const isDueToday = t.dueDate && new Date(t.dueDate).toDateString() === now.toDateString();
                    const isOverdue = t.dueDate && new Date(t.dueDate) < now;
                    const type = isOverdue || isDueToday ? 'due_task' : t.createdByRole === 'admin' ? 'admin_task' : 'reminder';
                    const timeLabel = isOverdue
                        ? 'Overdue'
                        : isDueToday
                        ? 'Due Today'
                        : t.dueDate
                        ? new Date(t.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                        : 'Action required';

                    return {
                        id: String(t.id),
                        title: t.title || 'Task reminder',
                        subtitle: t.leadBusinessName ? `🏢 ${t.leadBusinessName}` : 'Assigned work item',
                        time: timeLabel,
                        type,
                        link: t.leadId ? `/sales/leads/${encodeURIComponent(t.leadId)}` : '/sales',
                        read: readSet.has(String(t.id))
                    };
                });

            setNotifications(items);
        } catch {  }
    }, []);

    useEffect(() => {
        loadNotifications();
    }, [loadNotifications, location.pathname]);

    useEffect(() => {
        if (!notifOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
                setNotifOpen(false);
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setNotifOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [notifOpen]);

    const markAllRead = () => {
        const readIds = notifications.map((n) => n.id);
        try {
            const stored = localStorage.getItem('lp.sales.readNotifs');
            const current = stored ? JSON.parse(stored) : [];
            const combined = Array.from(new Set([...current, ...readIds]));
            localStorage.setItem('lp.sales.readNotifs', JSON.stringify(combined));
        } catch {  }
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    };

    const handleNotificationClick = (item: SalesNotificationItem) => {
        try {
            const stored = localStorage.getItem('lp.sales.readNotifs');
            const current = stored ? JSON.parse(stored) : [];
            if (!current.includes(item.id)) {
                current.push(item.id);
                localStorage.setItem('lp.sales.readNotifs', JSON.stringify(current));
            }
        } catch {  }
        setNotifications((prev) =>
            prev.map((n) => (n.id === item.id ? { ...n, read: true } : n))
        );
        setNotifOpen(false);
        navigate(item.link);
    };

    const unreadCount = notifications.filter((n) => !n.read).length;

    useEffect(() => {
        apiGet('/api/sales/me')
            .then((data) => {
                setName(data.user?.name || '');
                setEmail(data.user?.email || '');
                setAvatarUrl(data.user?.avatarUrl || data.user?.avatar_url || '');
            })
            .catch(() => {
                clearToken();
                navigate('/', { replace: true });
            });
    }, [navigate]);

    useEffect(() => {
        setNavOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        if (!navOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setNavOpen(false);
        };
        window.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = prev;
        };
    }, [navOpen]);

    useEffect(() => {
        try {
            localStorage.setItem('lp.sidebarWidth.sales', String(sidebarWidth));
        } catch {  }
    }, [sidebarWidth]);

    useEffect(() => {
        if (!resizing) return;
        const onMove = (e: PointerEvent) => {
            const d = resizeRef.current;
            if (!d) return;
            setSidebarWidth(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(d.startW + (e.clientX - d.startX)))));
        };
        const onUp = () => {
            resizeRef.current = null;
            setResizing(false);
        };
        document.body.classList.add('cursor-sidebar-resize');
        document.body.style.userSelect = 'none';
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        return () => {
            document.body.classList.remove('cursor-sidebar-resize');
            document.body.style.userSelect = '';
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
        };
    }, [resizing]);

    const logout = () => {
        clearToken();
        navigate('/', { replace: true });
    };

    const initials =
        (name || email || 'S')
            .split(' ')
            .map((p) => p[0])
            .join('')
            .slice(0, 2)
            .toUpperCase() || 'S';

    const sidebar = (
        <>
            <div className="px-5 pt-5 pb-4 shrink-0 flex items-start justify-between gap-2 border-b-2 border-[#E2E8F0]">
                <img
                    src="/localseo.png"
                    alt="Local SEO"
                    className="h-9 w-auto max-w-[180px] object-contain object-left min-w-0 flex-1"
                    style={{ maxHeight: '36px', maxWidth: '160px', objectFit: 'contain' }}
                />
                <button
                    type="button"
                    className="lg:hidden p-2 -mr-1 rounded-lg text-[#64748B] hover:bg-[#F1F5F9]"
                    aria-label="Close menu"
                    onClick={() => setNavOpen(false)}
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            <nav className="flex-1 px-3 pt-3 space-y-4 overflow-y-auto">
                {NAV_GROUPS.map((grp) => (
                    <div key={grp.section} className="space-y-1">
                        <p className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-[#94A3B8]">
                            {grp.section}
                        </p>
                        {grp.items.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.end}
                                className={() => {
                                    const active = item.end
                                        ? location.pathname === item.to
                                        : location.pathname.startsWith(item.to);
                                    return cn(
                                        'flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl text-sm transition-colors',
                                        active
                                            ? 'bg-[#F59E0B] text-[#0F172A] font-semibold'
                                            : 'text-[#64748B] font-medium hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                                    );
                                }}
                            >
                                <item.icon className="w-[18px] h-[18px] shrink-0" strokeWidth={1.75} />
                                <span>{item.name}</span>
                            </NavLink>
                        ))}
                    </div>
                ))}
            </nav>

            <div className="px-4 pb-4 pt-3 border-t-2 border-[#E2E8F0] shrink-0 space-y-3 safe-pb">
                <div className="flex items-center gap-3 px-1">
                    <div className="w-9 h-9 rounded-full bg-[#0F172A] text-white overflow-hidden flex items-center justify-center text-xs font-bold shrink-0 border border-[#E2E8F0]">
                        {avatarUrl ? (
                            <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                            initials
                        )}
                    </div>
                    <div className="min-w-0 leading-tight">
                        <p className="text-sm font-semibold text-[#0F172A] truncate">{name || 'Sales'}</p>
                        <p className="text-xs text-[#94A3B8] mt-0.5 truncate">{email || 'Sales agent'}</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={logout}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] rounded-xl border border-[#E2E8F0] bg-white text-sm font-semibold text-[#0F172A] hover:bg-[#F8FAFC] transition-colors"
                >
                    <LogOut className="w-4 h-4" strokeWidth={1.75} />
                    Log out
                </button>
            </div>
        </>
    );

    return (
        <div className="flex h-[100dvh] bg-[#EEF2F6] text-[#0F172A] overflow-hidden">
            <aside
                className="relative hidden lg:flex h-full shrink-0 bg-white border-r border-[#E2E8F0] flex-col overflow-hidden"
                style={{ width: sidebarWidth }}
            >
                {sidebar}
                <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize sidebar"
                    onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        e.preventDefault();
                        resizeRef.current = { startX: e.clientX, startW: sidebarWidth };
                        setResizing(true);
                    }}
                    className="absolute inset-y-0 right-0 z-20 w-1.5 translate-x-1/2 cursor-sidebar-resize touch-none"
                >
                    <span className={`pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 ${resizing ? 'bg-[#F59E0B]' : 'bg-transparent hover:bg-[#CBD5E1]'}`} />
                </div>
            </aside>

            {navOpen && (
                <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
                    <button
                        type="button"
                        className="absolute inset-0 bg-black/40"
                        aria-label="Close menu"
                        onClick={() => setNavOpen(false)}
                    />
                    <aside className="absolute inset-y-0 left-0 w-[min(288px,88vw)] max-w-full bg-white border-r border-[#E2E8F0] flex flex-col shadow-xl">
                        {sidebar}
                    </aside>
                </div>
            )}

            <div className="flex-1 flex flex-col min-w-0 min-h-0">
                <header className="shrink-0 sticky top-0 z-30 border-b border-[#E2E8F0] bg-white/95 backdrop-blur px-3 sm:px-5 lg:px-6 py-2.5 sm:py-3 safe-pt">
                    <div className="flex items-center justify-between lg:justify-end gap-4 min-h-[40px]">
                        <button
                            type="button"
                            className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-xl border border-[#E2E8F0] bg-white text-[#0F172A] shrink-0 shadow-2xs hover:bg-[#F8FAFC]"
                            aria-label="Open menu"
                            aria-expanded={navOpen}
                            onClick={() => setNavOpen(true)}
                        >
                            <Menu className="w-5 h-5" />
                        </button>

                        {/* Notification Bell & Popover Box */}
                        <div className="relative shrink-0" ref={notifRef}>
                            <button
                                type="button"
                                onClick={() => setNotifOpen((prev) => !prev)}
                                className="relative p-2.5 rounded-xl border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] text-[#64748B] hover:text-[#0F172A] transition-all shadow-2xs cursor-pointer flex items-center justify-center"
                                title="Notifications"
                            >
                                <Bell className="w-4 h-4 text-slate-700" />
                                <span
                                    className={cn(
                                        'absolute -top-1.5 -right-1.5 px-1.5 min-w-[18px] h-4.5 rounded-full text-[10px] font-black flex items-center justify-center border-2 border-white transition-all',
                                        unreadCount > 0
                                            ? 'bg-rose-500 text-white'
                                            : 'bg-slate-200 text-slate-600'
                                    )}
                                >
                                    {unreadCount}
                                </span>
                            </button>

                            {notifOpen && (
                                <div
                                    className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-2xl bg-white border border-[#E2E8F0] shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-150"
                                >
                                    {/* Header with Title & Mark All Read */}
                                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-black text-slate-900">Notifications</span>
                                            <span className={cn(
                                                'px-2 py-0.5 rounded-full text-[10px] font-black',
                                                unreadCount > 0 ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-slate-100 text-slate-600'
                                            )}>
                                                {unreadCount} {unreadCount === 1 ? 'new' : 'unread'}
                                            </span>
                                        </div>
                                        {notifications.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={markAllRead}
                                                className="text-xs font-bold text-orange-600 hover:text-orange-700 hover:bg-orange-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                                                title="Mark all notifications as read"
                                            >
                                                <CheckCheck className="w-3.5 h-3.5" />
                                                <span>Mark all read</span>
                                            </button>
                                        )}
                                    </div>

                                    {/* Notifications List or 0 State */}
                                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                                        {notifications.length === 0 || unreadCount === 0 ? (
                                            <div className="py-8 px-4 text-center">
                                                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
                                                    <Bell className="w-5 h-5 text-slate-400" />
                                                </div>
                                                <p className="text-sm font-bold text-slate-900">0 Notifications</p>
                                                <p className="text-xs text-slate-500 mt-0.5">All caught up! No pending alerts or reminders.</p>
                                            </div>
                                        ) : (
                                            notifications.map((notif) => (
                                                <div
                                                    key={notif.id}
                                                    onClick={() => handleNotificationClick(notif)}
                                                    className={cn(
                                                        'p-3 px-4 hover:bg-slate-50 transition-colors cursor-pointer flex items-start justify-between gap-3',
                                                        !notif.read ? 'bg-orange-50/20' : 'opacity-70'
                                                    )}
                                                >
                                                    <div className="flex items-start gap-2.5 min-w-0">
                                                        <div className={cn(
                                                            'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
                                                            notif.type === 'due_task' ? 'bg-rose-50 text-rose-600' :
                                                            notif.type === 'admin_task' ? 'bg-purple-50 text-purple-600' :
                                                            'bg-amber-50 text-amber-600'
                                                        )}>
                                                            {notif.type === 'due_task' ? <Clock className="w-4 h-4" /> :
                                                             notif.type === 'admin_task' ? <Shield className="w-4 h-4" /> :
                                                             <Bell className="w-4 h-4" />}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className={cn('text-xs font-bold text-slate-900 truncate', !notif.read && 'text-orange-950')}>
                                                                {notif.title}
                                                            </p>
                                                            <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                                                {notif.subtitle}
                                                            </p>
                                                            <span className="text-[10px] text-slate-400 font-medium">
                                                                {notif.time}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {!notif.read && (
                                                        <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0 mt-1.5" />
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    {/* Footer */}
                                    <div className="border-t border-slate-100 px-4 py-2 bg-slate-50/60 rounded-b-2xl flex items-center justify-between">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setNotifOpen(false);
                                                navigate('/sales/reminders');
                                            }}
                                            className="text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors"
                                        >
                                            View Reminders & Tasks →
                                        </button>
                                        {unreadCount > 0 && (
                                            <button
                                                type="button"
                                                onClick={markAllRead}
                                                className="text-xs font-bold text-orange-600 hover:underline"
                                            >
                                                Clear All
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </header>
                <main className="flex-1 overflow-auto overscroll-contain p-3 sm:p-5 lg:p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
