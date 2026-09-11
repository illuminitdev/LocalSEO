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
    Sparkles,
    BookMarked,
    CalendarClock,
    Settings,
    UserRound,
    Users,
    MessageSquare,
    Megaphone,
    Wallet,
    CalendarDays,
    Wrench,
    LogOut,
    Menu,
    X
} from 'lucide-react';
import { apiGet, cn } from './utils';
import { clearToken } from '../features/auth/auth';
import { hasRouteAccess, routeRequiresFeatures } from './planCatalog';
import { useEntitlements } from './EntitlementsContext';
import MustChangePasswordBanner from '../features/account/MustChangePasswordBanner';

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
            { name: 'AI Insights', to: '/report', icon: Sparkles, featurePath: '/report' },
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
            { name: 'Dispatch', to: '/dispatch', icon: CalendarDays, featurePath: '/dispatch' },
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
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        try {
            const n = Number(localStorage.getItem('lp.sidebarWidth.user'));
            if (Number.isFinite(n)) return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(n)));
        } catch { /* ignore */ }
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
                /* ignore — sidebar still works */
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
        } catch { /* ignore */ }
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
                                                ? 'bg-[#F59E0B] text-white font-semibold'
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
                        <div className="w-9 h-9 rounded-full bg-[#FFF7ED] text-[#D97706] flex items-center justify-center text-sm font-bold shrink-0">
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
        <div className="flex h-[100dvh] bg-[#F8FAFC] text-[#0F172A] overflow-hidden">
            {/* Desktop sidebar */}
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
                    <span className={`pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 ${resizing ? 'bg-[#F59E0B]' : 'bg-transparent hover:bg-[#CBD5E1]'}`} />
                </div>
            </aside>

            {/* Mobile drawer */}
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
                <header className="lg:hidden shrink-0 sticky top-0 z-30 flex items-center gap-3 px-3 sm:px-4 py-3 border-b border-[#E2E8F0] bg-white/95 backdrop-blur safe-pt print:hidden">
                    <button
                        type="button"
                        className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-[#E2E8F0] bg-white text-[#0F172A]"
                        aria-label="Open menu"
                        aria-expanded={navOpen}
                        onClick={() => setNavOpen(true)}
                    >
                        <Menu className="w-5 h-5" />
                    </button>
                    <div className="min-w-0 flex-1">
                        <img
                            src="/localseo.png"
                            alt="Local SEO"
                            className="h-7 w-auto max-w-[140px] object-contain object-left"
                            style={{ maxHeight: '28px', maxWidth: '140px', objectFit: 'contain' }}
                        />
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
