import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, LogOut, Layers, Settings, Menu, X, ClipboardList, CheckSquare, ClipboardCheck } from 'lucide-react';
import { clearAdminToken } from './adminApi';
import { cn } from '../../shared/utils';

const NAV = [
    { name: 'Overview', to: '/admin', icon: LayoutDashboard, end: true },
    { name: 'Users', to: '/admin/users', icon: Users },
    { name: 'Full Audit', to: '/admin/full-audits', icon: ClipboardCheck },
    { name: 'Growth leads', to: '/admin/growth-audit-leads', icon: ClipboardList },
    { name: 'Lead Tasks & CRM', to: '/admin/tasks', icon: CheckSquare },
    { name: 'Plan guide', to: '/admin/services', icon: Layers },
    { name: 'Settings', to: '/admin/settings', icon: Settings }
];

function pageTitle(pathname: string) {
    if (pathname.match(/\/admin\/users\/(user|invite)\//)) {
        return { title: 'User details', subtitle: 'Plan, renew date, autopay status, and tools for this user.' };
    }
    if (pathname.startsWith('/admin/users')) {
        return { title: 'User Management', subtitle: 'Create and manage system users.' };
    }
    if (pathname.startsWith('/admin/full-audits/new')) {
        return {
            title: 'New full audit',
            subtitle: 'Run a deep crawl — Maps/GBP lookup, website score, shareable report + PDF.'
        };
    }
    if (pathname.match(/\/admin\/full-audits\/[^/]+/)) {
        return {
            title: 'Full audit details',
            subtitle: 'Shareable report link and print-quality PDF download.'
        };
    }
    if (pathname.startsWith('/admin/full-audits')) {
        return {
            title: 'Full Audit',
            subtitle: 'Deep / fullcrawl history from the shared ZappSites audits table.'
        };
    }
    if (pathname.startsWith('/admin/growth-audit-leads')) {
        return {
            title: 'Growth audit leads',
            subtitle: 'Prospects who submitted the Free Growth Audit on ZappSites.'
        };
    }
    if (pathname.startsWith('/admin/tasks')) {
        return {
            title: 'Lead Tasks & CRM',
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

    const logout = () => {
        clearAdminToken();
        navigate('/', { replace: true });
    };

    const sidebar = (
        <>
            <div className="px-5 pt-5 pb-4 shrink-0 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <img
                        src="/localseo.png"
                        alt="Local SEO"
                        className="h-9 w-auto max-w-[180px] object-contain object-left"
                    />
                    <p className="mt-5 text-[13px] font-medium text-[#94A3B8]">Admin Portal</p>
                </div>
                <button
                    type="button"
                    className="lg:hidden p-2 -mr-1 rounded-lg text-[#64748B] hover:bg-[#F1F5F9]"
                    aria-label="Close menu"
                    onClick={() => setNavOpen(false)}
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            <nav className="px-3 flex-1 overflow-y-auto space-y-0.5 overscroll-contain">
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
            </nav>

            <div className="px-4 pb-4 pt-3 shrink-0 space-y-3 safe-pb">
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
        <div className="flex h-[100dvh] bg-[#EEF2F6] text-[#0F172A] overflow-hidden">
            <aside className="hidden lg:flex w-[260px] h-full shrink-0 bg-white border-r border-[#E2E8F0] flex-col overflow-hidden">
                {sidebar}
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
