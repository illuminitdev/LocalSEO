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
        <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
            <header className="bg-[#0F172A] text-white border-b border-white/10">
                <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[#F59E0B] flex items-center justify-center">
                            <Shield className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold">ZappSites Admin</p>
                            <p className="text-[10px] text-white/50 uppercase tracking-widest">Local SEO &amp; platform</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={logout}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-white/70 hover:text-white"
                    >
                        <LogOut className="w-3.5 h-3.5" />
                        Sign out
                    </button>
                </div>
            </header>

            <div className="max-w-6xl mx-auto px-4 py-6">
                <nav className="flex gap-2 mb-6">
                    {NAV.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.end}
                            className={({ isActive }) => cn(
                                'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                                isActive
                                    ? 'bg-white text-[#0F172A] shadow-sm border border-[#E2E8F0]'
                                    : 'text-[#64748B] hover:text-[#0F172A] hover:bg-white/60'
                            )}
                        >
                            <item.icon className="w-4 h-4" />
                            {item.name}
                        </NavLink>
                    ))}
                </nav>

                <Outlet />
            </div>
        </div>
    );
}
