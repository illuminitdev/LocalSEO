import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, LogOut, Layers, Settings } from 'lucide-react';
import { clearAdminToken } from '../lib/adminAuth';
import { cn } from '../lib/utils';

const NAV = [
    { name: 'Overview', to: '/admin', icon: LayoutDashboard, end: true },
    { name: 'Customers', to: '/admin/users', icon: Users },
    { name: 'Plan guide', to: '/admin/services', icon: Layers },
    { name: 'Settings', to: '/admin/settings', icon: Settings }
];

function pageTitle(pathname: string) {
    if (pathname.match(/\/admin\/users\/(user|invite)\//)) {
        return { title: 'Customer details', subtitle: 'Plan, renew date, autopay status, and tools for this customer.' };
    }
    if (pathname.startsWith('/admin/users')) {
        return { title: 'Customers', subtitle: 'Click a customer to open their plan and billing page.' };
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

    const logout = () => {
        clearAdminToken();
        navigate('/', { replace: true });
    };

    return (
        <div className="flex h-screen bg-[#EEF2F6] text-[#0F172A]">
            <aside className="w-[260px] h-screen shrink-0 bg-white border-r border-[#E2E8F0] flex flex-col overflow-hidden">
                {/* Brand */}
                <div className="px-5 pt-5 pb-4 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-[#F59E0B] text-white flex items-center justify-center font-bold text-sm shrink-0">
                            z
                        </div>
                        <div className="min-w-0 leading-tight">
                            <p className="font-bold text-[15px] text-[#0F172A] tracking-tight truncate">ZappSites</p>
                            <p className="text-[11px] text-[#94A3B8] mt-0.5 truncate">Local SEO simplified.</p>
                        </div>
                    </div>
                    <p className="mt-5 text-[13px] font-medium text-[#94A3B8]">Admin Portal</p>
                </div>

                {/* Nav */}
                <nav className="px-3 flex-1 overflow-y-auto space-y-0.5">
                    {NAV.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.end}
                            className={({ isActive }) => {
                                const active =
                                    item.to === '/admin/users'
                                        ? location.pathname.startsWith('/admin/users')
                                        : isActive;
                                return cn(
                                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors',
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

                {/* Footer: user + logout */}
                <div className="px-4 pb-4 pt-3 shrink-0 space-y-3">
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
                        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-[#E2E8F0] bg-white text-sm font-semibold text-[#0F172A] hover:bg-[#F8FAFC] transition-colors"
                    >
                        <LogOut className="w-4 h-4" strokeWidth={1.75} />
                        Log out
                    </button>
                </div>
            </aside>

            <div className="flex-1 flex flex-col min-w-0">
                <header className="shrink-0 border-b border-[#E2E8F0] bg-white/90 backdrop-blur px-6 py-4">
                    <h1 className="text-xl font-bold tracking-tight text-[#0F172A]">{heading.title}</h1>
                    <p className="text-sm text-[#64748B] mt-0.5 max-w-2xl">{heading.subtitle}</p>
                </header>
                <main className="flex-1 overflow-auto p-5 lg:p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
