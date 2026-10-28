import { useEffect, useRef, useState, type ComponentType } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
    Building2,
    LayoutDashboard,
    FileText,
    Star,
    MessageSquareQuote,
    MapPin,
    Image as ImageIcon,
    BookMarked,
    CalendarClock,
    BadgeCheck,
    Settings,
    UserRound,
    Users,
    MessageSquare,
    Megaphone,
    Wallet,
    Wrench,
    LogOut,
    Menu,
    X,
    Bell,
    MessageSquarePlus,
    CheckCheck,
    Truck,
    KeyRound,
    Bot,
    LineChart
} from 'lucide-react';
import { apiGet, apiPost, cn } from './utils';
import { timeAgo, useNotificationFeed, type FeedNotification } from './useNotificationFeed';
import { clearToken } from '../features/auth/auth';
import { hasRouteAccess, routeRequiresFeatures } from './planCatalog';
import { useEntitlements } from './EntitlementsContext';
import LowCreditsBanner from './LowCreditsBanner';
import { SIDEBAR_RAIL_WIDTH, SidebarToggleButton, useSidebarCollapsed } from './SidebarToggle';

const HOST_NOTIF_ICON: Record<string, { icon: ComponentType<any>; cls: string }> = {
    booking: { icon: CalendarClock, cls: 'bg-emerald-50 text-emerald-600' },
    review: { icon: Star, cls: 'bg-amber-50 text-amber-600' },
    quote: { icon: FileText, cls: 'bg-blue-50 text-blue-600' },
    rank: { icon: BadgeCheck, cls: 'bg-purple-50 text-purple-600' },
    message: { icon: MessageSquare, cls: 'bg-sky-50 text-sky-600' },
    billing: { icon: Wallet, cls: 'bg-rose-50 text-rose-600' },
    security: { icon: KeyRound, cls: 'bg-amber-50 text-amber-700' }
};

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 380;
const SIDEBAR_DEFAULT = 260;

function BrandMark({
    style,
    className
}: {
    style: { height: number; maxWidth: number };
    className?: string;
}) {
    return (
        <img
            src="/localseo.png"
            alt="Local SEO"
            className={cn('w-auto max-w-full object-contain object-left min-w-0', className)}
            style={style}
        />
    );
}

type NavItem = {
    name: string;
    to: string;
    icon: ComponentType<{ className?: string; strokeWidth?: number }>;
    end?: boolean;
    match?: 'board' | 'settings';
    featurePath: string;
};

type NavSection = {
    group: string;
    items: NavItem[];
};

function AiInsightsIcon({ className = 'w-5 h-5', strokeWidth = 2 }: { className?: string; strokeWidth?: number }) {
    return (
        <svg
            className={className}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            {/* Trend line with circular vertices */}
            <path d="M3 13L7.5 8.5L12 12L20 4" />
            <circle cx="3" cy="13" r="1.5" fill="currentColor" />
            <circle cx="7.5" cy="8.5" r="1.5" fill="currentColor" />
            <circle cx="12" cy="12" r="1.5" fill="currentColor" />
            <circle cx="20" cy="4" r="1.5" fill="currentColor" />
            {/* Vertical bars */}
            <path d="M3.5 17.5v3" />
            <path d="M9.5 15.5v5" />
            <path d="M15.5 13v7.5" />
        </svg>
    );
}

const NAV: NavSection[] = [
    { group: 'Overview', items: [{ name: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, end: true, featurePath: '/dashboard' }] },
    {
        group: 'Track visibility',
        items: [
            { name: 'Local Search Grid', to: '/rank-tracker', icon: MapPin, featurePath: '/rank-tracker' },
            { name: 'Visibility Tracker', to: '/visibility-tracker', icon: LineChart, featurePath: '/visibility-tracker' },
            { name: 'AI Insights', to: '/report', icon: AiInsightsIcon, featurePath: '/report' },
            { name: 'LLM Visibility', to: '/llm-visibility', icon: Bot, featurePath: '/llm-visibility' },
        ]
    },
    {
        group: 'Manage listings',
        items: [
            { name: 'Business profile', to: '/profile', icon: Building2, featurePath: '/profile' },
            { name: 'Citations', to: '/citations', icon: BookMarked, featurePath: '/citations' },
            { name: 'GBP posts', to: '/posts', icon: FileText, featurePath: '/posts' },
            { name: 'Photos', to: '/media', icon: ImageIcon, featurePath: '/media' },
        ]
    },
    {
        group: 'Grow reputation',
        items: [
            { name: 'Reviews', to: '/reviews', icon: Star, featurePath: '/reviews' },
            { name: 'Q&A', to: '/qa', icon: MessageSquareQuote, featurePath: '/qa' },
        ]
    },
    {
        group: 'Booking Plots',
        items: [
            { name: 'Booking board', to: '/booking', icon: CalendarClock, end: true, match: 'board' as const, featurePath: '/booking' },
            { name: 'Clients', to: '/clients', icon: Users, featurePath: '/clients' },
            { name: 'Quotes', to: '/quotes', icon: FileText, featurePath: '/quotes' },
            { name: 'Inbox', to: '/inbox', icon: MessageSquare, featurePath: '/inbox' },
            { name: 'Team', to: '/team', icon: Users, featurePath: '/team' },
            { name: 'Dispatch', to: '/dispatch', icon: Truck, featurePath: '/dispatch' },
            { name: 'Field', to: '/field', icon: Wrench, featurePath: '/field' },
            { name: 'Jobs & money', to: '/money', icon: Wallet, featurePath: '/money' },
            { name: 'Marketing', to: '/marketing', icon: Megaphone, featurePath: '/marketing' },
            { name: 'Schedule settings', to: '/booking?panel=settings&tab=events', icon: Settings, match: 'settings' as const, featurePath: '/booking' },
        ]
    },
    {
        group: 'Account',
        items: [{ name: 'Account', to: '/account', icon: UserRound, end: true, featurePath: '/account' }]
    },
];

export default function Layout() {
    const location = useLocation();
    const navigate = useNavigate();
    const searchParams = new URLSearchParams(location.search);
    const bookingPanel = searchParams.get('panel');
    const { features, loading, entitlementsDisabled } = useEntitlements();
    const [userName, setUserName] = useState('');
    const [userEmail, setUserEmail] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [navOpen, setNavOpen] = useState(false);
    const [notifOpen, setNotifOpen] = useState(false);
    const notifRef = useRef<HTMLDivElement | null>(null);

    // Live feed (bookings, reviews, quotes, inbox, rank scans, billing, security) built by the API;
    // cleared/read state is saved per user in the DB so it survives reloads and other devices.
    const {
        items: notifications,
        unreadCount,
        refresh: refreshNotifications,
        markRead,
        markAllRead,
        clearAll
    } = useNotificationFeed({
        fetchFeed: () => apiGet('/api/notifications'),
        postState: (action) => apiPost('/api/notifications/state', action),
        refreshKey: location.pathname
    });

    useEffect(() => {
        const onAuth = () => refreshNotifications();
        window.addEventListener('localpulse-auth', onAuth);
        return () => window.removeEventListener('localpulse-auth', onAuth);
    }, [refreshNotifications]);

    useEffect(() => {
        if (notifOpen) refreshNotifications();
    }, [notifOpen, refreshNotifications]);

    const handleNotificationClick = (item: FeedNotification) => {
        markRead(item.id);
        setNotifOpen(false);
        if (item.link) navigate(item.link);
    };

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
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [notifOpen]);
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        try {
            const n = Number(localStorage.getItem('lp.sidebarWidth.user'));
            if (Number.isFinite(n)) return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(n)));
        } catch {  }
        return SIDEBAR_DEFAULT;
    });
    const [collapsed, toggleCollapsed] = useSidebarCollapsed('lp.sidebarCollapsed.user');
    const [resizing, setResizing] = useState(false);
    const resizeRef = useRef<{ startX: number; startW: number } | null>(null);

    useEffect(() => {
        apiGet('/api/auth/me')
            .then((data) => {
                setUserName(data.user?.name || data.name || '');
                setUserEmail(data.user?.email || data.email || '');
                setAvatarUrl(data.user?.avatarUrl || data.user?.avatar_url || '');
            })
            .catch(() => {
                
            });
    }, []);

    useEffect(() => {
        setNavOpen(false);
    }, [location.pathname, location.search]);

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
            localStorage.setItem('lp.sidebarWidth.user', String(sidebarWidth));
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

    const isNavActive = (item: NavItem) => {
        if (!item.to.startsWith('/booking')) {
            if (item.to === '/clients') {
                return location.pathname === '/clients' || location.pathname.startsWith('/clients/');
            }
            if (item.to === '/quotes') {
                return location.pathname === '/quotes' || location.pathname.startsWith('/quotes/');
            }
            return location.pathname === item.to || (item.end ? false : location.pathname.startsWith(item.to));
        }
        if (location.pathname !== '/booking') return false;
        if (item.match === 'settings') return bookingPanel === 'settings';
        return bookingPanel !== 'settings';
    };

    const visibleNav = NAV.map((section) => ({
        ...section,
        items: section.items.filter((item) => {
            if (entitlementsDisabled) return true;
            if (loading) return routeRequiresFeatures(item.featurePath).length === 0;
            return hasRouteAccess(features, item.featurePath);
        })
    })).filter((section) => section.items.length > 0);

    const logout = () => {
        clearToken();
        navigate('/', { replace: true });
    };

    const initials = (userName || userEmail || 'U').charAt(0).toUpperCase();

    
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
                {!rail && <BrandMark style={{ height: logoH, maxWidth: logoMaxW }} />}
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

            <nav className="px-3 pt-3 flex-1 overflow-y-auto space-y-4 pb-3 overscroll-contain">
                {visibleNav.map((section, i) => (
                    <div key={section.group}>
                        {rail ? (
                            i > 0 && <div className="mx-2 mb-2 border-t border-[#E2E8F0]" />
                        ) : (
                            <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                                {section.group}
                            </p>
                        )}
                        <div className="space-y-0.5">
                            {section.items.map((item) => (
                                <NavLink
                                    key={item.to}
                                    to={item.to}
                                    end={item.end}
                                    onClick={() => setNavOpen(false)}
                                    title={rail ? item.name : undefined}
                                    aria-label={rail ? item.name : undefined}
                                    className={() =>
                                        cn(
                                            'flex items-center gap-3 py-2.5 rounded-xl text-sm transition-colors min-h-[44px]',
                                            rail ? 'justify-center px-0' : 'px-3',
                                            isNavActive(item)
                                                ? 'text-[#0F172A] font-semibold bg-[var(--brand-primary)]'
                                                : 'text-[#334155] font-medium hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                                        )
                                    }
                                >
                                    <item.icon className="w-[18px] h-[18px] shrink-0" strokeWidth={1.75} />
                                    {!rail && <span className="truncate">{item.name}</span>}
                                </NavLink>
                            ))}
                        </div>
                    </div>
                ))}
            </nav>

            <div className={cn('pb-4 pt-3 border-t-2 border-[#E2E8F0] shrink-0 space-y-3 safe-pb', rail ? 'px-2' : 'px-4')}>
                <div className={cn('flex items-center gap-3 min-w-0', rail ? 'justify-center' : 'px-1')} title={rail ? userName || userEmail || 'Account' : undefined}>
                    {avatarUrl ? (
                        <img src={avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                    ) : (
                        <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 text-[var(--brand-primary)]"
                            style={{ background: 'color-mix(in srgb, var(--brand-primary) 14%, white)' }}
                        >
                            {initials}
                        </div>
                    )}
                    {!rail && (
                        <div className="min-w-0 leading-tight">
                            <p className="text-sm font-semibold text-[#0F172A] truncate">{userName || 'Account'}</p>
                            <p className="text-xs text-[#94A3B8] mt-0.5 truncate">{userEmail || 'Signed in'}</p>
                        </div>
                    )}
                </div>
                <button
                    type="button"
                    onClick={logout}
                    title={rail ? 'Logout' : undefined}
                    aria-label={rail ? 'Logout' : undefined}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] rounded-xl border border-[#E2E8F0] bg-white text-sm font-semibold text-[#0F172A] hover:bg-[#F8FAFC] transition-colors"
                >
                    <LogOut className="w-4 h-4" strokeWidth={1.75} />
                    {!rail && 'Logout'}
                </button>
            </div>
        </>
    );

    return (
        <div className="flex h-[100dvh] bg-[#F8FAFC] text-[#0F172A] overflow-hidden">
            {}
            <aside
                className="relative hidden lg:flex h-full shrink-0 bg-white border-r border-[#E2E8F0] flex-col overflow-hidden print:hidden min-w-0"
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
                                resizing ? 'bg-[var(--brand-primary)]' : 'bg-transparent'
                            }`}
                        />
                    </div>
                )}
            </aside>

            {}
            {navOpen && (
                <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
                    <button
                        type="button"
                        className="absolute inset-0 bg-black/40"
                        aria-label="Close menu"
                        onClick={() => setNavOpen(false)}
                    />
                    <aside className="absolute inset-y-0 left-0 w-[min(288px,88vw)] max-w-full bg-white border-r border-[#E2E8F0] flex flex-col shadow-xl animate-in slide-in-from-left print:hidden">
                        {renderSidebar(false)}
                    </aside>
                </div>
            )}

            <div className="flex-1 flex flex-col min-w-0 min-h-0">
                <header className="h-14 shrink-0 sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 border-b border-[#E2E8F0] bg-white print:hidden">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-xl border border-[#E2E8F0] bg-white text-[#0F172A]"
                            aria-label="Open menu"
                            aria-expanded={navOpen}
                            onClick={() => setNavOpen(true)}
                        >
                            <Menu className="w-5 h-5" />
                        </button>
                        <div className="min-w-0 lg:hidden">
                            <BrandMark style={{ height: 32, maxWidth: 140 }} />
                        </div>
                    </div>

                    {/* Right action icons: Quotes + Notifications */}
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        {/* Quotes quick button: booking plans and Complete Growth only (not Local Presence / Local Growth) */}
                        {entitlementsDisabled || features.includes('bookings') ? (
                        <button
                            type="button"
                            onClick={() => navigate('/quotes')}
                            className={cn(
                                'p-2 rounded-xl transition-colors cursor-pointer',
                                location.pathname.startsWith('/quotes')
                                    ? 'text-[var(--brand-primary,#F59E0B)] bg-amber-50 font-bold'
                                    : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
                            )}
                            title="Quotes"
                        >
                            <MessageSquarePlus className="w-5 h-5" strokeWidth={1.75} />
                        </button>
                        ) : null}

                        {/* Notifications Bell + Popover */}
                        <div className="relative" ref={notifRef}>
                            <button
                                type="button"
                                onClick={() => setNotifOpen((prev) => !prev)}
                                className={cn(
                                    'p-2 rounded-xl transition-colors cursor-pointer relative',
                                    notifOpen
                                        ? 'text-[#0F172A] bg-[#F1F5F9]'
                                        : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
                                )}
                                title="Notifications"
                                aria-expanded={notifOpen}
                            >
                                <Bell className="w-5 h-5" strokeWidth={1.75} />
                                {unreadCount > 0 && (
                                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#EF4444] text-white text-[10px] font-black leading-[18px] text-center ring-2 ring-white">
                                        {unreadCount > 9 ? '9+' : unreadCount}
                                    </span>
                                )}
                            </button>

                            {/* Notifications Popover Box */}
                            {notifOpen && (
                                <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_15px_50px_-12px_rgba(15,23,42,0.3)] z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                                    {/* Popover Header */}
                                    <div className="px-4 py-3 border-b border-[#F1F5F9] flex items-center justify-between bg-gradient-to-r from-white to-[#F8FAFC]">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-sm text-[#0F172A]">Notifications</span>
                                            {unreadCount > 0 && (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800">
                                                    {unreadCount} new
                                                </span>
                                            )}
                                        </div>
                                        {notifications.length > 0 && (
                                            <div className="flex items-center gap-2">
                                                {unreadCount > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={markAllRead}
                                                        className="text-xs font-semibold text-[var(--brand-primary,#F59E0B)] hover:underline flex items-center gap-1 cursor-pointer"
                                                    >
                                                        <CheckCheck className="w-3.5 h-3.5" />
                                                        Mark all as read
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={clearAll}
                                                    className="text-xs font-semibold text-[#64748B] hover:text-[#0F172A] cursor-pointer"
                                                >
                                                    Clear all
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Notification List */}
                                    <div className="max-h-[360px] overflow-y-auto divide-y divide-[#F1F5F9]">
                                        {notifications.length === 0 ? (
                                            <div className="py-10 px-6 text-center">
                                                <div className="w-10 h-10 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] text-[#94A3B8] flex items-center justify-center mx-auto mb-2.5">
                                                    <Bell className="w-5 h-5" strokeWidth={1.5} />
                                                </div>
                                                <p className="text-xs font-bold text-[#0F172A]">No notifications yet</p>
                                                <p className="text-[11px] text-[#94A3B8] mt-0.5">You're all caught up!</p>
                                            </div>
                                        ) : (
                                            notifications.map((n) => {
                                                const cfg = HOST_NOTIF_ICON[n.type] || HOST_NOTIF_ICON.booking;
                                                const IconComponent = cfg.icon;
                                                return (
                                                    <div
                                                        key={n.id}
                                                        onClick={() => handleNotificationClick(n)}
                                                        className={cn(
                                                            'p-3.5 flex items-start gap-3 cursor-pointer transition-colors hover:bg-[#F8FAFC]',
                                                            !n.read && 'bg-amber-50/40'
                                                        )}
                                                    >
                                                        <div
                                                            className={cn(
                                                                'h-9 w-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm',
                                                                cfg.cls
                                                            )}
                                                        >
                                                            <IconComponent className="w-4 h-4" strokeWidth={2} />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <p className="text-xs font-bold text-[#0F172A] truncate">
                                                                    {n.title}
                                                                </p>
                                                                <span className="text-[10px] text-[#94A3B8] shrink-0">
                                                                    {timeAgo(n.time)}
                                                                </span>
                                                            </div>
                                                            <p className="text-[11px] text-[#64748B] mt-0.5 leading-snug line-clamp-2">
                                                                {n.body}
                                                            </p>
                                                        </div>
                                                        {!n.read && (
                                                            <span
                                                                className="w-2 h-2 rounded-full shrink-0 mt-1.5"
                                                                style={{ background: 'var(--brand-primary, #F59E0B)' }}
                                                            />
                                                        )}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </header>
                <main className="flex-1 overflow-auto overscroll-contain p-4 sm:p-5 lg:p-6">
                    <LowCreditsBanner />
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
