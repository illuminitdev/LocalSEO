import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, MapPin, Shield, Star } from 'lucide-react';

const POINTS = [
    { icon: MapPin, label: 'Local rankings' },
    { icon: Star, label: 'Reviews' },
    { icon: CalendarClock, label: 'Bookings' }
];

type Props = {
    children: ReactNode;
    title: string;
    subtitle: string;
    showSecureFooter?: boolean;
    showLegalFooter?: boolean;
};

/** True 50/50 auth shell — image left, form right */
export default function AuthShell({ children, title, subtitle, showSecureFooter = true, showLegalFooter = true }: Props) {
    return (
        <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
            <aside className="relative min-h-[42vh] lg:min-h-screen overflow-hidden bg-[#0B1220]">
                <img
                    src="/auth-bg.jpg"
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover object-bottom"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-[#0B1220]/92 via-[#0B1220]/55 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-t from-[#0B1220]/30 to-transparent pointer-events-none" />

                <div className="relative z-[1] flex flex-col h-full min-h-[42vh] lg:min-h-screen px-8 py-8 lg:px-10 lg:py-10">
                    <div className="flex items-center gap-2.5 shrink-0">
                        <div className="h-8 w-8 rounded bg-[#EA580C] text-white flex items-center justify-center font-bold text-sm leading-none">
                            z
                        </div>
                        <span className="text-[15px] font-semibold tracking-tight text-white">Zappsites</span>
                    </div>

                    <div className="mt-10 lg:mt-14 max-w-lg">
                        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#EA580C]">
                            Local SEO
                        </p>
                        <h1 className="mt-3 text-[1.6rem] sm:text-[1.85rem] lg:text-[2rem] font-semibold tracking-tight leading-tight text-white whitespace-nowrap">
                            Workspace for trade businesses
                        </h1>
                        <p className="mt-4 text-[14px] text-white/60 leading-relaxed max-w-md">
                            Rank locally, manage listings, grow reviews, and take bookings — one place for your trade business.
                        </p>
                        <div className="mt-7 pt-5 border-t border-white/15 flex flex-wrap gap-x-6 gap-y-3">
                            {POINTS.map(({ icon: Icon, label }) => (
                                <div key={label} className="flex items-center gap-2 text-sm text-white/75">
                                    <Icon className="w-4 h-4 text-[#EA580C]" strokeWidth={1.75} />
                                    <span>{label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <p className="absolute bottom-8 left-8 lg:left-10 text-xs text-white/30">For Zappsites customers</p>
                </div>
            </aside>

            <section className="bg-white px-6 py-10 sm:px-12 lg:px-14 flex flex-col items-center justify-center min-h-screen">
                <div className="w-full max-w-[400px] flex-1 flex flex-col justify-center">
                    <h2 className="text-[1.75rem] font-semibold text-[#0F172A] tracking-tight">{title}</h2>
                    <p className="text-sm text-[#64748B] mt-2 leading-relaxed">{subtitle}</p>
                    <div className="mt-8">{children}</div>
                </div>
                {showSecureFooter && (
                    <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-[#94A3B8]">
                        <Shield className="w-3.5 h-3.5" strokeWidth={1.75} />
                        Secure login
                    </p>
                )}
                {showLegalFooter && (
                    <p className="mt-3 text-center text-xs text-[#94A3B8] leading-relaxed px-4">
                        Read our{' '}
                        <Link to="#" className="text-[#2563EB] hover:underline">
                            Privacy Policy
                        </Link>{' '}
                        and{' '}
                        <Link to="#" className="text-[#2563EB] hover:underline">
                            Terms and Conditions
                        </Link>
                        .
                    </p>
                )}
            </section>
        </div>
    );
}

export const authFieldClass =
    'mt-1.5 w-full rounded-lg border border-[#E2E8F0] bg-white pl-10 pr-3 py-2.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0F172A] focus:ring-1 focus:ring-[#0F172A]';

export function AuthFieldWrap({ children, icon: Icon }: { children: ReactNode; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }) {
    return (
        <div className="relative">
            <Icon className="absolute left-3 top-[calc(50%+3px)] -translate-y-1/2 w-4 h-4 text-[#94A3B8] pointer-events-none" strokeWidth={1.75} />
            {children}
        </div>
    );
}
