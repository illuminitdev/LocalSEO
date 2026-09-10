import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, LogOut, Menu, UserRound, X } from 'lucide-react';
import { apiGet, cn } from '../../shared/utils';
import { clearToken } from '../auth/auth';

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 380;
const SIDEBAR_DEFAULT = 260;

const NAV_GROUPS = [
    {
        section: 'OVERVIEW',
        items: [{ name: 'Dashboard', to: '/sales', icon: LayoutDashboard, end: true }]
    },
    {
        section: 'ACCOUNT',
        items: [{ name: 'Account', to: '/sales/account', icon: UserRound, end: true }]
    }
];

function pageTitle(pathname: string) {
    if (pathname.startsWith('/sales/account')) {
        return { title: 'Settings', subtitle: 'Manage your account profile and security.' };
    }
    if (pathname.startsWith('/sales/leads/')) {
        return { title: 'Lead', subtitle: 'Call, log outcome, and update status.' };
    }
    return { title: 'Dashboard', subtitle: 'Leads assigned to you. Call, log, follow up.' };
}

export default function SalesLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const heading = pageTitle(location.pathname);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [navOpen, setNavOpen] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        try {
            const n = Number(localStorage.getItem('lp.sidebarWidth.sales'));
            if (Number.isFinite(n)) return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(n)));
        } catch { /* ignore */ }
        return SIDEBAR_DEFAULT;
    });
    const [resizing, setResizing] = useState(false);
    const resizeRef = useRef<{ startX: number; startW: number } | null>(null);

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
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        return () => {
            document.body.style.cursor = '';
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
                    className="absolute inset-y-0 right-0 z-20 w-1.5 translate-x-1/2 cursor-col-resize touch-none"
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
                <header className="shrink-0 sticky top-0 z-30 border-b border-[#E2E8F0] bg-white/95 backdrop-blur px-3 sm:px-5 lg:px-6 py-3 sm:py-4 safe-pt">
                    <div className="flex items-start gap-3">
                        <button
                            type="button"
                            className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-xl border border-[#E2E8F0] bg-white text-[#0F172A] shrink-0"
                            aria-label="Open menu"
                            aria-expanded={navOpen}
                            onClick={() => setNavOpen(true)}
                        >
                            <Menu className="w-5 h-5" />
                        </button>
                        <div className="min-w-0 flex-1">
                            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[#0F172A]">{heading.title}</h1>
                            <p className="text-xs sm:text-sm text-[#64748B] mt-0.5 max-w-2xl leading-relaxed">
                                {heading.subtitle}
                            </p>
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
