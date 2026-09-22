import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard, Users, LogOut, Layers, Settings, Menu, X,
    ClipboardList, CheckSquare, ClipboardCheck, Bell,
    UserPlus, AlertCircle, CheckCheck, FileText, Zap
} from 'lucide-react';
import { clearAdminToken } from './adminApi';
import { cn } from '../shared/utils';

// ─── Notification Types ───────────────────────────────────────────────────────
type NotifType = 'lead' | 'task' | 'audit' | 'system' | 'alert';

interface AdminNotification {
    id: string;
    type: NotifType;
    title: string;
    body: string;
    time: string;
    read: boolean;
}



function timeAgo(iso: string): string {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
}

type IconConfig = { icon: React.ElementType; bg: string; color: string };

const NOTIF_ICON: Record<NotifType, IconConfig> = {
    lead:   { icon: UserPlus,    bg: 'bg-blue-50',    color: 'text-blue-500'    },
    task:   { icon: CheckSquare, bg: 'bg-orange-50',  color: 'text-orange-500'  },
    audit:  { icon: FileText,    bg: 'bg-emerald-50', color: 'text-emerald-500' },
    system: { icon: Zap,         bg: 'bg-violet-50',  color: 'text-violet-500'  },
    alert:  { icon: AlertCircle, bg: 'bg-red-50',     color: 'text-red-500'     },
};

// ─── Notification Bell Component ──────────────────────────────────────────────
function NotificationBell({ notifRef, notifOpen, setNotifOpen }: {
    notifRef: React.RefObject<HTMLDivElement | null>;
    notifOpen: boolean;
    setNotifOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
    const [notifications, setNotifications] = useState<AdminNotification[]>([]);

    const unreadCount = notifications.filter((n) => !n.read).length;

    const markAllRead = () => {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    };

    const markOneRead = (id: string) => {
        setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    };

    return (
        <div className="relative shrink-0" ref={notifRef}>
            <button
                type="button"
                id="admin-notif-bell"
                onClick={() => setNotifOpen((prev) => !prev)}
                className={cn(
                    'relative p-2 rounded-xl transition-all duration-150 cursor-pointer',
                    notifOpen
                        ? 'bg-amber-50 text-amber-600 ring-2 ring-amber-200'
                        : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9]'
                )}
                title="Notifications"
                aria-expanded={notifOpen}
                aria-label="Open notifications"
            >
                <Bell className={cn('w-5 h-5 transition-transform duration-200', notifOpen && 'scale-110')} strokeWidth={1.75} />
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 ring-2 ring-white text-white text-[9px] font-black flex items-center justify-center leading-none">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {notifOpen && (
                <div
                    id="admin-notif-panel"
                    className="absolute right-0 top-full mt-2 w-[340px] sm:w-[380px] rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_20px_60px_-12px_rgba(15,23,42,0.2)] z-50 overflow-hidden"
                    style={{ animation: 'notifSlideIn 0.18s cubic-bezier(0.16,1,0.3,1)' }}
                >
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-[#F1F5F9] flex items-center justify-between bg-gradient-to-r from-[#F8FAFC] to-white">
                        <div className="flex items-center gap-2">
                            <Bell className="w-4 h-4 text-[#64748B]" strokeWidth={1.75} />
                            <span className="font-bold text-sm text-[#0F172A]">Notifications</span>
                            {unreadCount > 0 && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-100 text-red-600">
                                    {unreadCount} new
                                </span>
                            )}
                        </div>
                        {unreadCount > 0 && (
                            <button
                                type="button"
                                id="admin-notif-mark-all-read"
                                onClick={markAllRead}
                                className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 hover:text-amber-700 transition-colors px-2 py-1 rounded-lg hover:bg-amber-50"
                            >
                                <CheckCheck className="w-3.5 h-3.5" />
                                Mark all read
                            </button>
                        )}
                    </div>

                    {/* List */}
                    <div className="max-h-[380px] overflow-y-auto overscroll-contain divide-y divide-[#F1F5F9]">
                        {notifications.map((notif) => {
                            const cfg = NOTIF_ICON[notif.type];
                            const IconComp = cfg.icon;
                            return (
                                <button
                                    type="button"
                                    key={notif.id}
                                    id={'admin-notif-item-' + notif.id}
                                    onClick={() => markOneRead(notif.id)}
                                    className={cn(
                                        'w-full text-left flex items-start gap-3 px-4 py-3.5 transition-colors duration-100',
                                        notif.read ? 'bg-white hover:bg-[#F8FAFC]' : 'bg-blue-50/40 hover:bg-blue-50/70'
                                    )}
                                >
                                    <div className={cn('flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center mt-0.5', cfg.bg)}>
                                        <IconComp className={cn('w-4 h-4', cfg.color)} strokeWidth={1.75} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2">
                                            <p className={cn('text-sm leading-tight', notif.read ? 'font-medium text-[#475569]' : 'font-semibold text-[#0F172A]')}>
                                                {notif.title}
                                            </p>
                                            <span className="text-[10px] text-[#94A3B8] shrink-0 mt-0.5 font-medium">{timeAgo(notif.time)}</span>
                                        </div>
                                        <p className="text-xs text-[#64748B] mt-0.5 leading-relaxed line-clamp-2">{notif.body}</p>
                                    </div>
                                    {!notif.read && <span className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500 mt-2" />}
                                </button>
                            );
                        })}
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-2.5 border-t border-[#F1F5F9] bg-[#F8FAFC]">
                        <p className="text-[11px] text-[#94A3B8] text-center font-medium">
                            {unreadCount === 0 ? 'All caught up! ✓' : unreadCount + ' unread notification' + (unreadCount !== 1 ? 's' : '')}
                        </p>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes notifSlideIn {
                    from { opacity: 0; transform: translateY(-8px) scale(0.97); }
                    to   { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
        </div>
    );
}


const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 380;
const SIDEBAR_DEFAULT = 240;

const NAV = [
    { name: 'Overview', to: '/admin', icon: LayoutDashboard, end: true },
    { name: 'Users', to: '/admin/users', icon: Users },
    { name: 'Full Audit', to: '/admin/full-audits', icon: ClipboardCheck },
    { name: 'Leads', to: '/admin/growth-audit-leads', icon: ClipboardList },
    { name: 'CRM', to: '/admin/tasks', icon: CheckSquare },
    { name: 'Plan guide', to: '/admin/services', icon: Layers },
    { name: 'Settings', to: '/admin/settings', icon: Settings }
];

function pageTitle(pathname: string) {
    if (pathname.match(/\/admin\/users\/(user|invite)\//)) {
        return {
            title: 'User details',
            subtitle: 'Account info for this user. Sales agents show assigned tasks instead of plans.'
        };
    }
    if (pathname.startsWith('/admin/users')) {
        return { title: 'User Management', subtitle: 'Create and manage system users.' };
    }
    if (pathname.startsWith('/admin/full-audits')) {
        return {
            title: 'Full Audit',
            subtitle: 'Create deep crawls and manage shareable report history.'
        };
    }
    if (pathname.startsWith('/admin/growth-audit-leads')) {
        return {
            title: 'Leads',
            subtitle: 'ZappSites form submissions — contact, start, visibility, growth audit, and checkout.'
        };
    }
    if (pathname.startsWith('/admin/tasks')) {
        return {
            title: 'CRM',
            subtitle: 'Assign tasks to telecallers, track audits, customer onboarding, and follow-ups.'
        };
    }
    if (pathname.startsWith('/admin/services')) {
        return { title: 'Plan guide', subtitle: 'Which portal tools each paid plan includes.' };
    }
    if (pathname.startsWith('/admin/settings')) {
        return { title: 'Settings', subtitle: 'Your admin login email and password.' };
    }
    return { title: 'Overview', subtitle: 'Quick health check for the Local SEO portal.' };
}

export default function AdminLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const heading = pageTitle(location.pathname);
    const [navOpen, setNavOpen] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        try {
            const n = Number(localStorage.getItem('lp.sidebarWidth.admin'));
            if (Number.isFinite(n)) return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(n)));
        } catch {  }
        return SIDEBAR_DEFAULT;
    });
    const [resizing, setResizing] = useState(false);
    const resizeRef = useRef<{ startX: number; startW: number } | null>(null);

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
            localStorage.setItem('lp.sidebarWidth.admin', String(sidebarWidth));
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

    const [notifOpen, setNotifOpen] = useState(false);
    const notifRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!notifOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
                setNotifOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [notifOpen]);

    const logout = () => {
        clearAdminToken();
        navigate('/', { replace: true });
    };

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

            <nav className="px-3 pt-3 flex-1 overflow-y-auto space-y-0.5 overscroll-contain">
                {NAV.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        onClick={() => setNavOpen(false)}
                        className={({ isActive }) => {
                            const active =
                                item.to === '/admin/users'
                                    ? location.pathname.startsWith('/admin/users')
                                    : item.to === '/admin/full-audits'
                                      ? location.pathname.startsWith('/admin/full-audits')
                                      : isActive;
                            return cn(
                                'flex items-center gap-2.5 px-3 py-2 min-h-[38px] rounded-xl text-sm transition-colors',
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
            </nav>

            <div className="px-4 pb-4 pt-3 border-t-2 border-[#E2E8F0] shrink-0 space-y-3 safe-pb">
                <div className="flex items-center gap-3 px-1">
                    <div className="w-9 h-9 rounded-full bg-[#0F172A] text-white flex items-center justify-center text-xs font-bold shrink-0">
                        AD
                    </div>
                    <div className="min-w-0 leading-tight">
                        <p className="text-sm font-semibold text-[#0F172A] truncate">Admin</p>
                        <p className="text-xs text-[#94A3B8] mt-0.5 truncate">Admin</p>
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
        <div className="flex h-[100dvh] bg-[#F8FAFC] text-[#0F172A] overflow-hidden">
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
                <header className="shrink-0 sticky top-0 z-30 border-b border-[#E2E8F0] bg-white/95 backdrop-blur px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3 safe-pt">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                            <button
                                type="button"
                                className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[#E2E8F0] bg-white text-[#0F172A] shrink-0"
                                aria-label="Open menu"
                                aria-expanded={navOpen}
                                onClick={() => setNavOpen(true)}
                            >
                                <Menu className="w-4 h-4" />
                            </button>
                            <div className="min-w-0 flex-1">
                                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[#0F172A] leading-tight">{heading.title}</h1>
                                <p className="text-xs text-[#64748B] mt-0.5 max-w-2xl leading-normal">
                                    {heading.subtitle}
                                </p>
                            </div>
                        </div>

                        {/* Notifications Bell */}
                        <NotificationBell notifRef={notifRef} notifOpen={notifOpen} setNotifOpen={setNotifOpen} />
                    </div>
                </header>
                <main className="flex-1 overflow-auto overscroll-contain p-4 sm:p-6 lg:p-8">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
