import { useEffect, useRef, useState, useCallback } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard, LogOut, Menu, UserRound, X, Bell, CheckSquare, PhoneCall, Users, CheckCheck, Clock, Shield,
    UserPlus, FileText, MessageSquare, Mail
} from 'lucide-react';
import { apiGet, apiPost, cn } from '../shared/utils';
import { clearToken } from '../features/auth/auth';
import { timeAgo, useNotificationFeed, type FeedNotification } from '../shared/useNotificationFeed';
import { SIDEBAR_RAIL_WIDTH, SidebarToggleButton, useSidebarCollapsed } from '../shared/SidebarToggle';

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 380;
const SIDEBAR_DEFAULT = 260;

const NAV_GROUPS = [
    {
        section: 'WORK & PIPELINE',
        items: [
            { name: 'Dashboard', to: '/sales', icon: LayoutDashboard, end: true },
            { name: 'Customers', to: '/sales/customers', icon: Users, end: true },
            { name: 'Leads', to: '/sales/tasks', icon: CheckSquare, end: true },
            { name: 'Self Reminders', to: '/sales/reminders', icon: Bell, end: true },
            { name: 'Call Logs', to: '/sales/calls', icon: PhoneCall, end: true }
        ]
    },
    {
        section: 'ACCOUNT',
        items: [{ name: 'Account', to: '/sales/account', icon: UserRound, end: true }]
    }
];

const SALES_NOTIF_ICON: Record<string, { icon: React.ElementType; cls: string }> = {
    due_task: { icon: Clock, cls: 'bg-rose-50 text-rose-600' },
    admin_task: { icon: Shield, cls: 'bg-purple-50 text-purple-600' },
    lead: { icon: UserPlus, cls: 'bg-blue-50 text-blue-600' },
    audit: { icon: FileText, cls: 'bg-emerald-50 text-emerald-600' },
    note: { icon: MessageSquare, cls: 'bg-sky-50 text-sky-600' },
    email: { icon: Mail, cls: 'bg-indigo-50 text-indigo-600' },
    reminder: { icon: Bell, cls: 'bg-amber-50 text-amber-600' }
};

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
    const [collapsed, toggleCollapsed] = useSidebarCollapsed('lp.sidebarCollapsed.sales');
    const [resizing, setResizing] = useState(false);
    const resizeRef = useRef<{ startX: number; startW: number } | null>(null);

    const location = useLocation();

    // Notifications: live feed from the server; cleared/read state is stored per agent in the DB.
    const [assignedTasksCount, setAssignedTasksCount] = useState(0);
    const [notifOpen, setNotifOpen] = useState(false);
    const notifRef = useRef<HTMLDivElement | null>(null);
    const {
        items: notifications,
        unreadCount,
        refresh: refreshNotifications,
        markRead,
        markAllRead,
        clearAll
    } = useNotificationFeed({
        fetchFeed: () => apiGet('/api/sales/notifications'),
        postState: (action) => apiPost('/api/sales/notifications/state', action),
        refreshKey: location.pathname
    });

    const loadTaskCount = useCallback(async () => {
        try {
            const data = await apiGet('/api/sales/tasks');
            const taskList = Array.isArray(data?.tasks) ? data.tasks : [];
            setAssignedTasksCount(
                taskList.filter((t: any) => t.status !== 'completed' && t.status !== 'cancelled').length
            );
        } catch {  }
    }, []);

    useEffect(() => {
        loadTaskCount();
        const handler = () => {
            loadTaskCount();
            refreshNotifications();
        };
        window.addEventListener('sales:task-updated', handler);
        return () => {
            window.removeEventListener('sales:task-updated', handler);
        };
    }, [loadTaskCount, refreshNotifications, location.pathname]);

    useEffect(() => {
        if (notifOpen) refreshNotifications();
    }, [notifOpen, refreshNotifications]);

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

    const handleNotificationClick = (item: FeedNotification) => {
        markRead(item.id);
        setNotifOpen(false);
        if (item.link) navigate(item.link);
    };


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

    const logoMaxW = Math.max(110, sidebarWidth - 76);
    const logoH = Math.round(Math.min(44, Math.max(32, logoMaxW * 0.22)));

    const renderSidebar = (rail: boolean) => (
        <>
            <div
                className={cn(
                    'min-h-16 pt-5 pb-3 shrink-0 flex items-center gap-2 min-w-0',
                    rail ? 'px-2 justify-center' : 'px-4 justify-between'
                )}
            >
                {!rail && (
                    <img
                        src="/localseo.png"
                        alt="Local SEO"
                        className="w-auto max-w-full object-contain object-left min-w-0"
                        style={{ height: logoH, maxWidth: logoMaxW }}
                    />
                )}
                <SidebarToggleButton collapsed={rail} onClick={toggleCollapsed} />
                <button
                    type="button"
                    className="lg:hidden p-2 -mr-1 rounded-lg text-[#64748B] hover:bg-[#F1F5F9] shrink-0"
                    aria-label="Close menu"
                    onClick={() => setNavOpen(false)}
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            <nav className="flex-1 px-3 pt-3 space-y-4 overflow-y-auto">
                {NAV_GROUPS.map((grp, i) => (
                    <div key={grp.section} className="space-y-1">
                        {rail ? (
                            i > 0 && <div className="mx-2 mb-2 border-t border-[#E2E8F0]" />
                        ) : (
                            <p className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-[#94A3B8]">
                                {grp.section}
                            </p>
                        )}
                        {grp.items.map((item) => {
                            const isTaskItem = item.to === '/sales/tasks';
                            return (
                                <NavLink
                                    key={item.to}
                                    to={item.to}
                                    end={item.end}
                                    title={rail ? item.name : undefined}
                                    aria-label={rail ? item.name : undefined}
                                    className={() => {
                                        const active = item.end
                                            ? location.pathname === item.to
                                            : location.pathname.startsWith(item.to);
                                        return cn(
                                            'relative flex items-center gap-2 py-2.5 min-h-[44px] rounded-xl text-sm transition-colors group/navitem',
                                            rail ? 'justify-center px-0' : 'justify-between px-3',
                                            active
                                                ? 'bg-[#F59E0B] text-[#0F172A] font-semibold'
                                                : 'text-[#64748B] font-medium hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                                        );
                                    }}
                                >
                                    {() => {
                                        const active = item.end
                                            ? location.pathname === item.to
                                            : location.pathname.startsWith(item.to);
                                        return (
                                            <>
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <item.icon className="w-[18px] h-[18px] shrink-0" strokeWidth={1.75} />
                                                    {!rail && <span className="truncate">{item.name}</span>}
                                                </div>
                                                {isTaskItem && assignedTasksCount > 0 && (
                                                    <span
                                                        className={cn(
                                                            rail && 'absolute -top-1 -right-1 !px-1.5',
                                                            'text-[10px] font-black px-2 py-0.5 rounded-full tabular-nums shadow-2xs shrink-0 tracking-tight',
                                                            active
                                                                ? 'bg-[#0F172A] text-[#F59E0B]'
                                                                : 'bg-[#F59E0B] text-[#0F172A]'
                                                        )}
                                                        title={`${assignedTasksCount} assigned task${assignedTasksCount > 1 ? 's' : ''}`}
                                                    >
                                                        +{assignedTasksCount}
                                                    </span>
                                                )}
                                            </>
                                        );
                                    }}
                                </NavLink>
                            );
                        })}
                    </div>
                ))}
            </nav>

            <div className={cn('pb-4 pt-3 border-t-2 border-[#E2E8F0] shrink-0 space-y-3 safe-pb', rail ? 'px-2' : 'px-4')}>
                <div className={cn('flex items-center gap-3', rail ? 'justify-center' : 'px-1')}>
                    <div className="w-9 h-9 rounded-full bg-[#0F172A] text-white overflow-hidden flex items-center justify-center text-xs font-bold shrink-0 border border-[#E2E8F0]">
                        {avatarUrl ? (
                            <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                            initials
                        )}
                    </div>
                    {!rail && (
                        <div className="min-w-0 leading-tight">
                            <p className="text-sm font-semibold text-[#0F172A] truncate">{name || 'Sales'}</p>
                            <p className="text-xs text-[#94A3B8] mt-0.5 truncate">{email || 'Sales agent'}</p>
                        </div>
                    )}
                </div>
                <button
                    type="button"
                    onClick={logout}
                    title={rail ? 'Log out' : undefined}
                    aria-label={rail ? 'Log out' : undefined}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] rounded-xl border border-[#E2E8F0] bg-white text-sm font-semibold text-[#0F172A] hover:bg-[#F8FAFC] transition-colors"
                >
                    <LogOut className="w-4 h-4" strokeWidth={1.75} />
                    {!rail && 'Log out'}
                </button>
            </div>
        </>
    );

    return (
        <div className="flex h-[100dvh] bg-[#EEF2F6] text-[#0F172A] overflow-hidden">
            <aside
                className="relative hidden lg:flex h-full shrink-0 bg-white border-r border-[#E2E8F0] flex-col overflow-hidden min-w-0"
                style={{ width: collapsed ? SIDEBAR_RAIL_WIDTH : sidebarWidth }}
            >
                {renderSidebar(collapsed)}
                {!collapsed && (
                    <div
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Resize sidebar"
                        onPointerDown={(e) => {
                            if (e.button !== 0) return;
                            e.preventDefault();
                            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                            resizeRef.current = { startX: e.clientX, startW: sidebarWidth };
                            setResizing(true);
                        }}
                        className="absolute inset-y-0 right-0 z-20 w-2 cursor-sidebar-resize touch-none"
                    >
                        <span
                            className={`pointer-events-none absolute inset-y-0 right-0 w-px ${
                                resizing ? 'bg-[#F59E0B]' : 'bg-transparent'
                            }`}
                        />
                    </div>
                )}
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
                        {renderSidebar(false)}
                    </aside>
                </div>
            )}

            <div className="flex-1 flex flex-col min-w-0 min-h-0">
                <header className="h-14 shrink-0 sticky top-0 z-30 border-b border-[#E2E8F0] bg-white/95 backdrop-blur px-3 sm:px-5 lg:px-6 safe-pt flex items-center">
                    <div className="flex items-center justify-between lg:justify-end gap-4 w-full min-w-0">
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
                                {unreadCount > 0 && (
                                    <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center leading-none shadow-sm">
                                        {unreadCount > 9 ? '9+' : unreadCount}
                                    </span>
                                )}
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
                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={markAllRead}
                                                    className="text-xs font-bold text-orange-600 hover:text-orange-700 hover:bg-orange-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                                                    title="Mark all notifications as read"
                                                >
                                                    <CheckCheck className="w-3.5 h-3.5" />
                                                    <span>Mark all read</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={clearAll}
                                                    className="text-xs font-bold text-slate-500 hover:text-slate-900 hover:bg-slate-100 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                                                >
                                                    Clear all
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Notifications List or 0 State */}
                                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                                        {notifications.length === 0 ? (
                                            <div className="py-8 px-4 text-center">
                                                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
                                                    <Bell className="w-5 h-5 text-slate-400" />
                                                </div>
                                                <p className="text-sm font-bold text-slate-900">You're all caught up</p>
                                                <p className="text-xs text-slate-500 mt-0.5">New leads, tasks, due reminders and audit updates will show here.</p>
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
                                                        {(() => {
                                                            const cfg = SALES_NOTIF_ICON[notif.type] || SALES_NOTIF_ICON.reminder;
                                                            const IconComp = cfg.icon;
                                                            return (
                                                                <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5', cfg.cls)}>
                                                                    <IconComp className="w-4 h-4" />
                                                                </div>
                                                            );
                                                        })()}
                                                        <div className="min-w-0">
                                                            <p className={cn('text-xs font-bold text-slate-900 truncate', !notif.read && 'text-orange-950')}>
                                                                {notif.title}
                                                            </p>
                                                            <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                                                {notif.body}
                                                            </p>
                                                            <span className="text-[10px] text-slate-400 font-medium">
                                                                {timeAgo(notif.time)}
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

                                    {}
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
                                        {notifications.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={clearAll}
                                                className="text-xs font-bold text-orange-600 hover:underline"
                                            >
                                                Clear all
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
