import { NavLink, Outlet, useLocation } from 'react-router-dom';
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
    UserRound
} from 'lucide-react';
import { cn } from '../lib/utils';

const NAV = [
    { group: 'Overview', items: [{ name: 'Dashboard', to: '/', icon: LayoutDashboard, end: true }] },
    {
        group: 'Track visibility',
        items: [
            { name: 'Local Search Grid', to: '/rank-tracker', icon: MapPin },
            { name: 'AI Insights', to: '/report', icon: Sparkles },
        ]
    },
    {
        group: 'Manage listings',
        items: [
            { name: 'Business profile', to: '/profile', icon: Building2 },
            { name: 'Citations', to: '/citations', icon: BookMarked },
            { name: 'GBP posts', to: '/posts', icon: FileText },
            { name: 'Photos', to: '/media', icon: ImageIcon },
        ]
    },
    {
        group: 'Grow reputation',
        items: [
            { name: 'Reviews', to: '/reviews', icon: Star },
            { name: 'Q&A', to: '/qa', icon: MessageSquareQuote },
        ]
    },
    {
        group: 'Booking Plots',
        items: [
            { name: 'Booking board', to: '/booking', icon: CalendarClock, end: true, match: 'board' as const },
            { name: 'Schedule settings', to: '/booking?panel=settings&tab=events', icon: Settings, match: 'settings' as const },
        ]
    },
    {
        group: 'Account',
        items: [{ name: 'Account', to: '/account', icon: UserRound, end: true }]
    },
];

export default function Layout() {
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const bookingPanel = searchParams.get('panel');

    const isNavActive = (item: { to: string; end?: boolean; match?: 'board' | 'settings' }) => {
        if (!item.to.startsWith('/booking')) {
            return location.pathname === item.to || (item.end ? false : location.pathname.startsWith(item.to));
        }
        if (location.pathname !== '/booking') return false;
        if (item.match === 'settings') return bookingPanel === 'settings';
        return bookingPanel !== 'settings';
    };

    return (
        <div className="flex h-screen bg-white text-[#0F172A]">
            <aside className="w-[260px] h-screen shrink-0 bg-[#0F172A] text-white overflow-y-auto overflow-x-hidden">
                <div className="px-4 py-4 flex items-center gap-2.5 border-b border-white/10">
                    <div className="w-8 h-8 rounded-md bg-[#F59E0B] text-white flex items-center justify-center font-bold text-sm shrink-0">
                        z
                    </div>
                    <div className="min-w-0 leading-none">
                        <p className="font-semibold text-[15px] tracking-tight truncate">Zappsites</p>
                        <p className="text-[10px] uppercase tracking-widest text-[#F59E0B] mt-1.5">Local SEO</p>
                    </div>
                </div>

                <nav className="px-3 py-3 space-y-4">
                    {NAV.map((section) => (
                        <div key={section.group}>
                            <p className="px-2.5 mb-1 text-[10px] font-bold uppercase tracking-wider text-white/40">{section.group}</p>
                            <div className="space-y-0.5">
                                {section.items.map((item) => (
                                    <NavLink
                                        key={item.to}
                                        to={item.to}
                                        end={'end' in item ? item.end : undefined}
                                        className={() => cn(
                                            'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors',
                                            isNavActive(item)
                                                ? 'bg-[#F59E0B] text-white'
                                                : 'text-white/75 hover:bg-white/10 hover:text-white'
                                        )}
                                    >
                                        <item.icon className="w-4 h-4 shrink-0" />
                                        {item.name}
                                    </NavLink>
                                ))}
                            </div>
                        </div>
                    ))}
                </nav>
            </aside>

            <div className="flex-1 flex flex-col min-w-0">
                <main className="flex-1 overflow-auto p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
