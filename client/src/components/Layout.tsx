import { useEffect, useState } from 'react';
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
    CalendarClock
} from 'lucide-react';
import { cn, apiGet } from '../lib/utils';
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
            { name: 'Booking Plots', to: '/booking', icon: CalendarClock },
        ]
    },
];

export default function Layout() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [business, setBusiness] = useState({ name: '', connected: false, category: '', address: '' });
    const [geminiOn, setGeminiOn] = useState(false);
    const location = useLocation();

    useEffect(() => {
        Promise.all([apiGet('/api/business'), apiGet('/api/status')])
            .then(([biz, status]) => {
                setBusiness(biz);
                setGeminiOn(Boolean(status.gemini));
            })
            .catch(() => {});
    }, [location.pathname, isModalOpen]);

    return (
        <div className="flex h-screen bg-[#F5F7F8] text-[#1C2430]">
            <aside className="w-[260px] flex flex-col bg-[#12333C] text-white shrink-0">
                <div className="px-5 py-5 border-b border-white/10">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[#C8D400] text-[#12333C] flex items-center justify-center font-black">L</div>
                        <div>
                            <p className="font-black text-lg leading-none tracking-tight">LocalPulse</p>
                            <p className="text-[10px] uppercase tracking-widest text-[#C8D400] mt-1">Local SEO platform</p>
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
                                        className={({ isActive }) => cn(
                                            'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                                            isActive
                                                ? 'bg-[#C8D400] text-[#12333C]'
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
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#C8D400] text-[#12333C] text-sm font-bold cursor-pointer hover:bg-[#d6e21a]"
                    >
                        <Search className="w-4 h-4" />
                        Add location
                    </button>
                </div>
            </aside>

            <div className="flex-1 flex flex-col min-w-0">
                <header className="h-16 bg-white border-b border-[#E3E8EA] flex items-center justify-between px-6 shrink-0">
                    <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-[#5B6770]">Location</p>
                        <p className="font-semibold truncate">{business.name || 'No location added'}</p>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                        <span className={cn(
                            'px-2.5 py-1 rounded-full text-xs font-bold',
                            geminiOn ? 'bg-[#C8D400]/30 text-[#12333C]' : 'bg-red-50 text-red-700'
                        )}>
                            {geminiOn ? 'Gemini connected' : 'No API key'}
                        </span>
                        <span className="text-[#5B6770] hidden sm:inline truncate max-w-[240px]">
                            {business.address || 'Add a location to start tracking'}
                        </span>
                    </div>
                </header>

                <main className="flex-1 overflow-auto p-6">
                    <Outlet />
                </main>
            </div>

            <GroundingModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
        </div>
    );
}
