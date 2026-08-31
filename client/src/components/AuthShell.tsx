import type { ReactNode } from 'react';
import { CalendarClock, MapPin, Star } from 'lucide-react';

const POINTS = [
    { icon: MapPin, label: 'Local rankings' },
    { icon: Star, label: 'Reviews' },
    { icon: CalendarClock, label: 'Bookings' }
];

type Props = {
    children: ReactNode;
    title: string;
    subtitle: string;
};

/** True 50/50 auth shell — brand left, form right */
export default function AuthShell({ children, title, subtitle }: Props) {
    return (
        <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
            <aside className="bg-[#0B1220] text-white px-10 py-12 lg:px-16 lg:py-16 flex flex-col min-h-[40vh] lg:min-h-screen">
                <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded bg-[#EA580C] text-white flex items-center justify-center font-bold text-sm leading-none">
                        z
                    </div>
                    <span className="text-[15px] font-semibold tracking-tight">Zappsites</span>
                </div>

                <div className="flex-1 flex flex-col justify-center py-12 lg:py-0">
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#EA580C]">
                        Local SEO
                    </p>
                    <h1 className="mt-4 text-[2rem] sm:text-[2.4rem] font-semibold tracking-tight leading-[1.12] max-w-[18ch]">
                        Workspace for trade businesses
                    </h1>
                    <p className="mt-5 text-[15px] text-white/50 leading-relaxed max-w-sm">
                        Rank locally, manage listings, grow reviews, and take bookings — one place for your trade business.
                    </p>
                    <div className="mt-10 pt-8 border-t border-white/10 flex flex-wrap gap-x-7 gap-y-3">
                        {POINTS.map(({ icon: Icon, label }) => (
                            <div key={label} className="flex items-center gap-2 text-sm text-white/65">
                                <Icon className="w-4 h-4 text-[#EA580C]" strokeWidth={1.75} />
                                <span>{label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <p className="text-xs text-white/25">For Zappsites customers</p>
            </aside>

            <section className="bg-white px-6 py-12 sm:px-12 lg:px-16 flex items-center justify-center min-h-screen">
                <div className="w-full max-w-[400px]">
                    <h2 className="text-[1.5rem] font-semibold text-[#0B1220] tracking-tight">{title}</h2>
                    <p className="text-sm text-[#6B7280] mt-2 leading-relaxed">{subtitle}</p>
                    <div className="mt-8">{children}</div>
                </div>
            </section>
        </div>
    );
}

export const authFieldClass =
    'mt-1.5 w-full rounded border border-[#D1D5DB] bg-white px-3 py-2.5 text-sm text-[#0B1220] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#0B1220] focus:ring-1 focus:ring-[#0B1220]';
