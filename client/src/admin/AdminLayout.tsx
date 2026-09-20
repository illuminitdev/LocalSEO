import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, LogOut, Layers, Settings, Menu, X, ClipboardList, CheckSquare, ClipboardCheck, Bell } from 'lucide-react';
import { clearAdminToken } from './adminApi';
import { cn } from '../shared/utils';

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
                        <div className="relative shrink-0" ref={notifRef}>
                            <button
                                type="button"
                                onClick={() => setNotifOpen((prev) => !prev)}
                                className={cn(
                                    'p-1.5 rounded-lg transition-colors cursor-pointer relative text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9]',
                                    notifOpen && 'text-[#0F172A] bg-[#F1F5F9]'
                                )}
                                title="Notifications"
                                aria-expanded={notifOpen}
                            >
                                <Bell className="w-5 h-5 text-[#475569]" strokeWidth={1.75} />
                                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#EF4444] ring-2 ring-white" />
                            </button>

                            {notifOpen && (
                                <div className="absolute right-0 top-full mt-2 w-80 sm:w-88 rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_15px_50px_-12px_rgba(15,23,42,0.25)] z-50 overflow-hidden">
                                    <div className="px-4 py-3 border-b border-[#F1F5F9] flex items-center justify-between bg-[#F8FAFC]">
                                        <span className="font-bold text-sm text-[#0F172A]">System Notifications</span>
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800">
                                            Admin
                                        </span>
                                    </div>
                                    <div className="p-4 space-y-3">
                                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                                            <p className="font-semibold text-slate-800">Local SEO Portal is Live</p>
                                            <p className="text-slate-500 mt-0.5">Rank tracker, GBP tools, and bookings are operating normally.</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </header>
                <main className="flex-1 overflow-auto overscroll-contain p-4 sm:p-6 lg:p-8">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
