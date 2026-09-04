import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, LogOut, Shield, Layers, Settings } from 'lucide-react';
import { clearAdminToken } from '../lib/adminAuth';
import { cn } from '../lib/utils';

const NAV = [
    { name: 'Overview', to: '/admin', icon: LayoutDashboard, end: true, hint: 'Numbers at a glance' },
    { name: 'Customers', to: '/admin/users', icon: Users, hint: 'Plans & renewals' },
    { name: 'Plan guide', to: '/admin/services', icon: Layers, hint: 'What each plan unlocks' },
    { name: 'Settings', to: '/admin/settings', icon: Settings, hint: 'Admin password' }
];

function pageTitle(pathname: string) {
    if (pathname.match(/\/admin\/users\/(user|invite)\//)) {
        return { title: 'Customer details', subtitle: 'Plan, renew date, autopay, and tools for this customer.' };
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
            <aside className="w-[248px] h-screen shrink-0 bg-[#0B1220] text-white flex flex-col overflow-hidden">
                <div className="px-4 py-5 border-b border-white/10 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[#F59E0B] flex items-center justify-center shrink-0 shadow-sm">
                            <Shield className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                            <p className="font-semibold text-[15px] tracking-tight truncate">ZappSites Admin</p>
                            <p className="text-[10px] uppercase tracking-[0.14em] text-[#F59E0B]/90 mt-1">Local SEO desk</p>
                        </div>
                    </div>
                </div>

                <nav className="px-3 py-4 space-y-1 flex-1 overflow-y-auto">
                    <p className="px-2.5 mb-2 text-[10px] font-bold uppercase tracking-wider text-white/35">Manage</p>
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
                                    'flex items-start gap-3 px-2.5 py-2.5 rounded-xl text-sm transition-colors',
                                    active
                                        ? 'bg-[#F59E0B] text-white shadow-sm'
                                        : 'text-white/75 hover:bg-white/10 hover:text-white'
                                );
                            }}
                        >
                            <item.icon className="w-4 h-4 shrink-0 mt-0.5" />
                            <span className="min-w-0">
                                <span className="block font-semibold leading-tight">{item.name}</span>
                                <span className="block text-[11px] mt-0.5 opacity-80 leading-snug">{item.hint}</span>
                            </span>
                        </NavLink>
                    ))}
                </nav>

                <div className="px-3 py-4 border-t border-white/10 shrink-0">
                    <button
                        type="button"
                        onClick={logout}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-sm font-medium text-white/65 hover:bg-white/10 hover:text-white"
                    >
                        <LogOut className="w-4 h-4" />
                        Sign out
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
