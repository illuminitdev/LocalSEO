import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, LogOut, Shield, Layers } from 'lucide-react';
import { clearAdminToken } from '../lib/adminAuth';
import { cn } from '../lib/utils';

const NAV = [
    { name: 'Overview', to: '/admin', icon: LayoutDashboard, end: true },
    { name: 'Users & billing', to: '/admin/users', icon: Users },
    { name: 'Services', to: '/admin/services', icon: Layers }
];

export default function AdminLayout() {
    const navigate = useNavigate();

    const logout = () => {
        clearAdminToken();
        navigate('/', { replace: true });
    };

    return (
        <div className="flex h-screen bg-[#F8FAFC] text-[#0F172A]">
            <aside className="w-[240px] h-screen shrink-0 bg-[#0F172A] text-white flex flex-col overflow-hidden">
                <div className="px-4 py-4 flex items-center gap-2.5 border-b border-white/10 shrink-0">
                    <div className="w-8 h-8 rounded-lg bg-[#F59E0B] flex items-center justify-center shrink-0">
                        <Shield className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 leading-none">
                        <p className="font-semibold text-[15px] tracking-tight truncate">ZappSites Admin</p>
                        <p className="text-[10px] uppercase tracking-widest text-[#F59E0B] mt-1.5">Local SEO</p>
                    </div>
                </div>

                <nav className="px-3 py-3 space-y-0.5 flex-1 overflow-y-auto">
                    {NAV.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.end}
                            className={({ isActive }) =>
                                cn(
                                    'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors',
                                    isActive
                                        ? 'bg-[#F59E0B] text-white'
                                        : 'text-white/75 hover:bg-white/10 hover:text-white'
                                )
                            }
                        >
                            <item.icon className="w-4 h-4 shrink-0" />
                            {item.name}
                        </NavLink>
                    ))}
                </nav>

                <div className="px-3 py-4 border-t border-white/10 shrink-0">
                    <button
                        type="button"
                        onClick={logout}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white"
                    >
                        <LogOut className="w-4 h-4" />
                        Sign out
                    </button>
                </div>
            </aside>

            <div className="flex-1 flex flex-col min-w-0">
                <main className="flex-1 overflow-auto p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
