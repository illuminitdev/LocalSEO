import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MapPin, Building2, Star, Activity, CheckCircle, Clock, TrendingUp, CalendarClock } from 'lucide-react';
import { apiGet } from '../lib/utils';

const ICONS: Record<string, any> = {
    Activity,
    Clock,
    TrendingUp,
    CheckCircle,
};

const PILLARS = [
    {
        to: '/rank-tracker',
        title: 'Track local visibility',
        body: 'See how you rank in the Local Pack, neighborhood by neighborhood, with a Local Search Grid.',
        icon: MapPin,
    },
    {
        to: '/profile',
        title: 'Manage listings',
        body: 'Keep NAP accurate, audit citations, schedule GBP posts, and fill photo categories.',
        icon: Building2,
    },
    {
        to: '/reviews',
        title: 'Grow online reputation',
        body: 'Monitor public reviews and answer customer questions from a knowledge base.',
        icon: Star,
    },
    {
        to: '/booking',
        title: 'Booking Plots',
        body: 'Share time slots, take deposits, and manage jobs — simple TradeSlot-style booking for your location.',
        icon: CalendarClock,
    },
];

export default function Dashboard() {
    const [stats, setStats] = useState<any>(null);
    const [business, setBusiness] = useState<any>(null);

    useEffect(() => {
        apiGet('/api/dashboard/stats').then(setStats).catch(() => setStats({ activities: [], completenessScore: 0 }));
        apiGet('/api/business').then(setBusiness).catch(() => {});
    }, []);

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#5B6770]">Shine bright, locally</p>
                <h1 className="text-3xl font-black tracking-tight mt-1">
                    {business?.name || 'Add a location to get started'}
                </h1>
                <p className="text-[#5B6770] mt-2 text-sm max-w-2xl">
                    LocalPulse follows the same three jobs as BrightLocal: track visibility, manage listings, and grow reputation.
                    Your Gemini key powers the lookups — you still need to add a real business with <span className="font-semibold text-[#12333C]">Add location</span>.
                </p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Avg Local Pack rank', value: stats?.visibilityRank ? `#${stats.visibilityRank}` : '—' },
                    { label: 'Top 3 coverage', value: `${stats?.top3Percentage || 0}%` },
                    { label: 'Profile completeness', value: `${stats?.completenessScore || 0}%` },
                    { label: 'Review reply rate', value: `${stats?.reviewResponseRate || 0}%` },
                ].map((kpi) => (
                    <div key={kpi.label} className="bg-white border border-[#E3E8EA] rounded-2xl p-4">
                        <p className="text-xs font-semibold text-[#5B6770]">{kpi.label}</p>
                        <p className="text-2xl font-black text-[#12333C] mt-1">{kpi.value}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                {PILLARS.map((pillar) => {
                    const Icon = pillar.icon;
                    return (
                        <Link
                            key={pillar.to}
                            to={pillar.to}
                            className="bg-white border border-[#E3E8EA] rounded-2xl p-6 hover:border-[#C8D400] hover:shadow-md transition-all group"
                        >
                            <div className="w-10 h-10 rounded-xl bg-[#12333C] text-[#C8D400] flex items-center justify-center mb-4">
                                <Icon className="w-5 h-5" />
                            </div>
                            <h2 className="font-bold text-lg">{pillar.title}</h2>
                            <p className="text-sm text-[#5B6770] mt-2 leading-relaxed">{pillar.body}</p>
                            <span className="inline-flex items-center gap-1 text-sm font-bold text-[#12333C] mt-4 group-hover:gap-2 transition-all">
                                Open <ArrowRight className="w-4 h-4" />
                            </span>
                        </Link>
                    );
                })}
            </div>

            <div className="bg-white border border-[#E3E8EA] rounded-2xl p-6">
                <h2 className="font-bold mb-4">Recent activity</h2>
                {stats?.activities?.length ? (
                    <div className="space-y-4">
                        {stats.activities.map((activity: any) => {
                            const Icon = ICONS[activity.icon] || CheckCircle;
                            return (
                                <div key={activity.id} className="flex gap-3">
                                    <Icon className="w-4 h-4 mt-0.5 text-[#12333C]" />
                                    <div>
                                        <p className="text-sm font-medium">{activity.message}</p>
                                        <p className="text-xs text-[#5B6770]">{activity.time}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p className="text-sm text-[#5B6770]">No activity yet. Add a location, then run a grid scan or citation audit.</p>
                )}
            </div>
        </div>
    );
}
