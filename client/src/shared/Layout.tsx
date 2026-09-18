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
    Wand2,
    BookMarked,
    CalendarClock,
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
    Truck
} from 'lucide-react';
import { apiGet, cn } from './utils';
import { clearToken } from '../features/auth/auth';
import { hasRouteAccess, routeRequiresFeatures } from './planCatalog';
import { useEntitlements } from './EntitlementsContext';
import MustChangePasswordBanner from '../features/account/MustChangePasswordBanner';
import { useOrgBrand } from './OrgBrandContext';

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 380;
const SIDEBAR_DEFAULT = 260;

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

const NAV: NavSection[] = [
    { group: 'Overview', items: [{ name: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, end: true, featurePath: '/dashboard' }] },
    {
        group: 'Track visibility',
        items: [
            { name: 'Local Search Grid', to: '/rank-tracker', icon: MapPin, featurePath: '/rank-tracker' },
            { name: 'AI Insights', to: '/report', icon: Wand2, featurePath: '/report' },
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
    const { logoUrl: orgLogoUrl, brandStyle } = useOrgBrand();
    const [userName, setUserName] = useState('');
    const [userEmail, setUserEmail] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [navOpen, setNavOpen] = useState(false);
    const [notifOpen, setNotifOpen] = useState(false);
    const notifRef = useRef<HTMLDivElement | null>(null);

    type NotificationItem = {
        id: string;
        title: string;
        desc: string;
        time: string;
        unread: boolean;
        link: string;
        type: 'review' | 'quote' | 'rank' | 'booking';
    };

    const [notifications, setNotifications] = useState<NotificationItem[]>([]);

    const unreadCount = notifications.filter((n) => n.unread).length;

    const markAllRead = () => {
        setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
    };

    const handleNotificationClick = (item: NotificationItem) => {
        setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, unread: false } : n)));
        setNotifOpen(false);
        navigate(item.link);
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

    
    const logoScale = sidebarWidth / SIDEBAR_DEFAULT;
    const logoHeight = Math.round(Math.min(64, Math.max(40, 52 * logoScale)));
    const logoWidth = Math.round(Math.min(240, Math.max(120, (sidebarWidth - 40) * 0.9)));

    const sidebar = (
        <>
            <div className="px-5 pt-5 pb-5 shrink-0 flex items-start justify-between gap-2 border-b-2 border-[#E2E8F0]">
                {orgLogoUrl ? (
                    <img
                        src={orgLogoUrl}
                        alt="Business logo"
                        className="shrink-0 object-contain object-left"
                        style={{ height: logoHeight, width: logoWidth, maxWidth: '100%' }}
                    />
                ) : (
                    <img
                        src="/localseo.png"
                        alt="Local SEO"
                        className="shrink-0 object-contain object-left"
                        style={{ height: logoHeight, width: logoWidth, maxWidth: '100%' }}
                    />
                )}
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
                {visibleNav.map((section) => (
                    <div key={section.group}>
                        <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                            {section.group}
                        </p>
                        <div className="space-y-0.5">
                            {section.items.map((item) => (
                                <NavLink
                                    key={item.to}
                                    to={item.to}
                                    end={item.end}
                                    onClick={() => setNavOpen(false)}
                                    className={() =>
                                        cn(
                                            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors min-h-[44px]',
                                            isNavActive(item)
                                                ? 'text-white font-semibold bg-[var(--brand-primary)]'
                                                : 'text-[#334155] font-medium hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                                        )
                                    }
                                >
                                    <item.icon className="w-[18px] h-[18px] shrink-0" strokeWidth={1.75} />
                                    <span className="truncate">{item.name}</span>
                                </NavLink>
                            ))}
                        </div>
                    </div>
                ))}
            </nav>

            <div className="px-4 pb-4 pt-3 border-t-2 border-[#E2E8F0] shrink-0 space-y-3 safe-pb">
                <div className="flex items-center gap-3 px-1 min-w-0">
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
                    <div className="min-w-0 leading-tight">
                        <p className="text-sm font-semibold text-[#0F172A] truncate">{userName || 'Account'}</p>
                        <p className="text-xs text-[#94A3B8] mt-0.5 truncate">{userEmail || 'Signed in'}</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={logout}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] rounded-xl border border-[#E2E8F0] bg-white text-sm font-semibold text-[#0F172A] hover:bg-[#F8FAFC] transition-colors"
                >
                    <LogOut className="w-4 h-4" strokeWidth={1.75} />
                    Logout
                </button>
            </div>
        </>
    );

    return (
        <div className="flex h-[100dvh] bg-[#F8FAFC] text-[#0F172A] overflow-hidden" style={brandStyle}>
            {}
            <aside
                className="relative hidden lg:flex h-full shrink-0 bg-white border-r border-[#E2E8F0] flex-col overflow-hidden print:hidden"
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
                    <span
                        className={`pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 ${
                            resizing ? 'bg-[var(--brand-primary)]' : 'bg-transparent hover:bg-[#CBD5E1]'
                        }`}
                    />
                </div>
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
                        {sidebar}
                    </aside>
                </div>
            )}

            <div className="flex-1 flex flex-col min-w-0 min-h-0">
                <header className="shrink-0 sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 py-3 border-b border-[#E2E8F0] bg-white print:hidden">
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
                            {orgLogoUrl ? (
                                <img
                                    src={orgLogoUrl}
                                    alt="Business logo"
                                    className="h-8 w-[140px] object-contain object-left"
                                />
                            ) : (
                                <img
                                    src="/localseo.png"
                                    alt="Local SEO"
                                    className="h-8 w-[140px] object-contain object-left"
                                />
                            )}
                        </div>
                    </div>

                    {/* Right action icons: Quotes + Notifications */}
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        {/* Quotes quick button */}
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
                                    <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#EF4444] ring-2 ring-white" />
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
                                                const IconComponent =
                                                    n.type === 'review'
                                                        ? Star
                                                        : n.type === 'quote'
                                                        ? FileText
                                                        : n.type === 'rank'
                                                        ? Wand2
                                                        : CalendarClock;
                                                return (
                                                    <div
                                                        key={n.id}
                                                        onClick={() => handleNotificationClick(n)}
                                                        className={cn(
                                                            'p-3.5 flex items-start gap-3 cursor-pointer transition-colors hover:bg-[#F8FAFC]',
                                                            n.unread && 'bg-amber-50/40'
                                                        )}
                                                    >
                                                        <div
                                                            className={cn(
                                                                'h-9 w-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm',
                                                                n.type === 'review'
                                                                    ? 'bg-amber-50 text-amber-600'
                                                                    : n.type === 'quote'
                                                                    ? 'bg-blue-50 text-blue-600'
                                                                    : n.type === 'rank'
                                                                    ? 'bg-purple-50 text-purple-600'
                                                                    : 'bg-emerald-50 text-emerald-600'
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
                                                                    {n.time}
                                                                </span>
                                                            </div>
                                                            <p className="text-[11px] text-[#64748B] mt-0.5 leading-snug line-clamp-2">
                                                                {n.desc}
                                                            </p>
                                                        </div>
                                                        {n.unread && (
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
                    <MustChangePasswordBanner />
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
