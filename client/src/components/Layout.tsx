import { useEffect, useState, type ComponentType } from 'react';
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
    LogOut
} from 'lucide-react';
import { apiGet, cn } from '../lib/utils';
import { clearToken } from '../lib/auth';
import { hasRouteAccess, routeRequiresFeatures } from '../lib/planCatalog';
import { useEntitlements } from '../context/EntitlementsContext';
import MustChangePasswordBanner from './MustChangePasswordBanner';

type NavItem = {
    name: string;
    to: string;
    icon: ComponentType<{ className?: string }>;
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

    useEffect(() => {
        apiGet('/api/auth/me')
            .then((data) => {
                setUserName(data.user?.name || data.name || '');
                setUserEmail(data.user?.email || data.email || '');
            })
            .catch(() => {
                /* ignore — sidebar still works */
            });
    }, []);

    const isNavActive = (item: NavItem) => {
        if (!item.to.startsWith('/booking')) {
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

    return (
        <div className="flex h-screen bg-[#F8FAFC] text-[#0F172A]">
            <aside className="w-[260px] h-screen shrink-0 bg-white border-r border-[#E2E8F0] flex flex-col overflow-hidden">
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
                </div>

                <nav className="px-3 flex-1 overflow-y-auto space-y-4 pb-3">
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
                                        className={() =>
                                            cn(
                                                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors',
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

                <div className="px-4 pb-4 pt-3 border-t border-[#E2E8F0] shrink-0 space-y-3">
                    <div className="flex items-center gap-3 px-1 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-[#FFF7ED] text-[#D97706] flex items-center justify-center text-sm font-bold shrink-0">
                            {initials}
                        </div>
                        <div className="min-w-0 leading-tight">
                            <p className="text-sm font-semibold text-[#0F172A] truncate">{userName || 'Account'}</p>
                            <p className="text-xs text-[#94A3B8] mt-0.5 truncate">{userEmail || 'Signed in'}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={logout}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-[#E2E8F0] bg-white text-sm font-semibold text-[#0F172A] hover:bg-[#F8FAFC] transition-colors"
                    >
                        <LogOut className="w-4 h-4" strokeWidth={1.75} />
                        Logout
                    </button>
                </div>
            </aside>

            <div className="flex-1 flex flex-col min-w-0">
                <main className="flex-1 overflow-auto p-6">
                    <MustChangePasswordBanner />
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
