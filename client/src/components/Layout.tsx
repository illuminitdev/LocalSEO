import { useState } from 'react';
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
    Search,
    BookMarked,
    CalendarClock,
    Settings
} from 'lucide-react';
import { cn } from '../lib/utils';
import GroundingModal from './GroundingModal';

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
];

export default function Layout() {
    const [isModalOpen, setIsModalOpen] = useState(false);
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
            <aside className="w-[260px] flex flex-col bg-[#0F172A] text-white shrink-0">
                <div className="px-5 py-5 border-b border-white/10">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[#F59E0B] text-white flex items-center justify-center font-black">L</div>
                        <div>
                            <p className="font-black text-lg leading-none tracking-tight">LocalPulse</p>
                            <p className="text-[10px] uppercase tracking-widest text-[#F59E0B] mt-1">Local SEO platform</p>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
                    {NAV.map((section) => (
                        <div key={section.group}>
                            <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-white/40">{section.group}</p>
                            <div className="space-y-0.5">
                                {section.items.map((item) => (
                                    <NavLink
                                        key={item.to}
                                        to={item.to}
                                        end={'end' in item ? item.end : undefined}
                                        className={() => cn(
                                            'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                                            isNavActive(item)
                                                ? 'bg-[#F59E0B] text-white'
                                                : 'text-white/75 hover:bg-white/10 hover:text-white'
                                        )}
                                    >
                                        <item.icon className="w-4 h-4" />
                                        {item.name}
                                    </NavLink>
                                ))}
                            </div>
                        </div>
                    ))}
                </nav>

                <div className="p-4 border-t border-white/10">
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#F59E0B] text-white text-sm font-bold cursor-pointer hover:bg-[#D97706]"
                    >
                        <Search className="w-4 h-4" />
                        Add location
                    </button>
                </div>
            </aside>

            <div className="flex-1 flex flex-col min-w-0">
                <main className="flex-1 overflow-auto p-6">
                    <Outlet />
                </main>
            </div>

            <GroundingModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
        </div>
    );
}
