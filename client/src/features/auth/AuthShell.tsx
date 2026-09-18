import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Globe, MapPin, TrendingUp, CalendarCheck, BarChart3, Image, Search, Star } from 'lucide-react';

type Props = {
    children: ReactNode;
    title: string;
    subtitle: string;
    showSecureFooter?: boolean;
    showLegalFooter?: boolean;
};


function LaptopMockup() {
    return (
        <div className="relative mx-auto" style={{ width: 300, maxWidth: '100%' }}>
            {}
            <div className="rounded-t-xl overflow-hidden" style={{ border: '5px solid #1E293B', borderBottom: 'none' }}>
                <div style={{ background: '#fff' }}>
                    {}
                    <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-[#E2E8F0]" style={{ background: '#F8FAFC' }}>
                        <span className="w-[7px] h-[7px] rounded-full bg-[#FCA5A5]" />
                        <span className="w-[7px] h-[7px] rounded-full bg-[#FDE68A]" />
                        <span className="w-[7px] h-[7px] rounded-full bg-[#86EFAC]" />
                        <div className="ml-2 flex-1 h-3.5 rounded-sm bg-white border border-[#E2E8F0]" />
                    </div>
                    {}
                    <div className="px-3.5 py-2.5 space-y-2.5">
                        {}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                                <div className="w-4 h-4 rounded" style={{ background: '#FF6A00' }} />
                                <div className="w-14 h-[5px] rounded-full bg-[#E2E8F0]" />
                            </div>
                            <div className="flex gap-1.5">
                                <div className="w-8 h-[5px] rounded-full bg-[#E2E8F0]" />
                                <div className="w-8 h-[5px] rounded-full bg-[#E2E8F0]" />
                            </div>
                        </div>
                        {}
                        <div className="h-[50px] rounded-md flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #FFF7ED, #FFEDD5)' }}>
                            <Image className="w-5 h-5" style={{ color: '#FF6A00' }} strokeWidth={1.5} />
                        </div>
                        {}
                        <div className="grid grid-cols-3 gap-1.5">
                            {[BarChart3, Search, Star].map((Icon, i) => (
                                <div key={i} className="rounded bg-[#F8FAFC] border border-[#F1F5F9] p-1.5 flex flex-col items-center gap-1">
                                    <Icon className="w-3.5 h-3.5" style={{ color: '#FF6A00' }} strokeWidth={1.5} />
                                    <div className="w-7 h-[4px] rounded-full bg-[#E2E8F0]" />
                                </div>
                            ))}
                        </div>
                        {}
                        <div className="space-y-1 pb-0.5">
                            <div className="w-full h-[4px] rounded-full bg-[#F1F5F9]" />
                            <div className="w-2/3 h-[4px] rounded-full bg-[#F1F5F9]" />
                        </div>
                    </div>
                </div>
            </div>
            {}
            <div
                className="h-[10px] rounded-b-lg"
                style={{
                    background: '#1E293B',
                    width: '115%',
                    marginLeft: '-7.5%',
                }}
            />
            {}
            <div
                className="h-[3px] rounded-b-xl"
                style={{
                    background: '#CBD5E1',
                    width: '125%',
                    marginLeft: '-12.5%',
                }}
            />
        </div>
    );
}

export default function AuthShell({ children, title, subtitle, showLegalFooter = true }: Props) {
    return (
        <div className="h-screen flex flex-col lg:flex-row overflow-hidden bg-white">
            {}
            <div
                className="w-full lg:w-[45%] flex flex-col justify-between px-6 sm:px-10 lg:px-14 xl:px-16 py-6 lg:py-8 bg-[#F8FAFC] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
            >
                <div className="w-full max-w-[420px] mx-auto flex-1 flex flex-col justify-center">
                    {}
                    <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-[#E2E8F0] px-6 py-8 sm:px-10 sm:py-10">
                        {}
                        <img
                            src="/localseo.png"
                            alt="ZappSites · Local SEO"
                            width={140}
                            height={42}
                            className="block mx-auto mb-8"
                            style={{ width: 140, height: 'auto' }}
                        />

                        {}
                        <h1 className="text-[24px] font-bold tracking-tight text-center" style={{ color: '#101828' }}>
                            {title}
                        </h1>
                        <p className="text-[13px] mt-1.5 text-center" style={{ color: '#64748B' }}>
                            {subtitle}
                        </p>

                        {}
                        <div className="mt-6">{children}</div>

                        {}
                        {showLegalFooter && (
                            <div className="mt-2 text-center">
                                <p className="text-[12px]" style={{ color: '#94A3B8' }}>
                                    <Link to="/privacy" className="hover:underline hover:text-[#64748B] transition-colors">Privacy</Link>
                                    <span className="mx-2">·</span>
                                    <Link to="/terms" className="hover:underline hover:text-[#64748B] transition-colors">Terms</Link>
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {}
            <div
                className="hidden lg:flex w-[55%] relative overflow-hidden items-center justify-center"
                style={{ background: '#FFFAF5' }}
            >
                {}
                <div
                    className="absolute rounded-full pointer-events-none"
                    style={{
                        width: 400,
                        height: 400,
                        bottom: -280,
                        right: -190,
                        background: '#FF6A00',
                        opacity: 0.92,
                    }}
                />
                <div
                    className="absolute rounded-full pointer-events-none"
                    style={{
                        width: 160,
                        height: 160,
                        top: -50,
                        left: -40,
                        background: 'radial-gradient(circle, rgba(255,106,0,0.10), transparent 70%)',
                    }}
                />
                <div
                    className="absolute rounded-full pointer-events-none"
                    style={{
                        width: 80,
                        height: 80,
                        top: 60,
                        right: 40,
                        background: 'rgba(255,106,0,0.06)',
                    }}
                />

                {}
                <div className="relative z-10 w-full max-w-lg px-8 xl:px-12 text-center">
                    {}
                    <h2
                        className="text-[28px] xl:text-[32px] font-bold leading-tight tracking-tight"
                        style={{ color: '#101828' }}
                    >
                        Build Your Online Presence
                    </h2>
                    <p
                        className="text-[28px] xl:text-[32px] font-bold leading-tight tracking-tight"
                        style={{ color: '#FF6A00' }}
                    >
                        Grow Locally
                    </p>
                    <p className="text-[13px] mt-3 leading-relaxed" style={{ color: '#64748B' }}>
                        Modern websites. Better visibility. More customers.
                    </p>

                    {}
                    <div className="relative mt-10">
                        {}
                        <div
                            className="absolute z-20 pointer-events-none select-none"
                            style={{
                                left: -100,
                                top: 30,
                                transform: 'rotate(-7deg)',
                                color: '#FF6A00',
                                fontSize: 11,
                                fontStyle: 'italic',
                                fontWeight: 500,
                                lineHeight: 1.35,
                            }}
                        >
                            Your business<br />online, locally
                            {}
                            <svg
                                width="40"
                                height="30"
                                viewBox="0 0 40 30"
                                fill="none"
                                style={{ display: 'block', marginTop: 2, marginLeft: 'auto' }}
                            >
                                <path
                                    d="M4 2C12 14 24 20 33 15.5"
                                    stroke="#FF6A00"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                />
                                <path
                                    d="M31.5 11.5L36.5 16.2L30.5 20.8"
                                    stroke="#FF6A00"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        </div>

                        {}
                        <div className="mr-auto" style={{ maxWidth: 280 }}>
                            <LaptopMockup />
                        </div>

                        {}
                        <div className="absolute z-20 flex flex-col gap-3" style={{ right: -50, top: 6 }}>
                            {([
                                { icon: Globe, label: 'Professional', sub: 'Websites', color: '#FF6A00', bg: '#FFF7ED', border: '#FDBA74' },
                                { icon: MapPin, label: 'Local SEO', sub: 'Ready', color: '#10B981', bg: '#ECFDF5', border: '#6EE7B7' },
                                { icon: TrendingUp, label: 'More', sub: 'Customers', color: '#3B82F6', bg: '#EFF6FF', border: '#93C5FD' },
                                { icon: CalendarCheck, label: 'Booking', sub: 'System', color: '#8B5CF6', bg: '#F5F3FF', border: '#C4B5FD' },
                            ] as const).map(({ icon: Icon, label, sub, color, bg, border }) => (
                                <div key={label} className="flex items-center gap-2.5">
                                    <div
                                        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                                        style={{
                                            background: bg,
                                            border: `1.5px solid ${border}`,
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                                        }}
                                    >
                                        <Icon className="w-4 h-4" style={{ color }} strokeWidth={2} />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-[11px] font-bold leading-tight" style={{ color: '#101828' }}>{label}</p>
                                        <p className="text-[11px] font-bold leading-tight" style={{ color: '#101828' }}>{sub}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {}
            <div
                className="lg:hidden w-full py-10 px-6 text-center relative overflow-hidden"
                style={{ background: '#FFFAF5' }}
            >
                <div
                    className="absolute rounded-full pointer-events-none"
                    style={{ width: 200, height: 200, bottom: -80, right: -60, background: '#FF6A00', opacity: 0.7 }}
                />
                <h2 className="text-xl font-bold tracking-tight relative z-10" style={{ color: '#101828' }}>
                    Build Your Online Presence
                </h2>
                <p className="text-xl font-bold tracking-tight relative z-10" style={{ color: '#FF6A00' }}>
                    Grow Locally
                </p>
                <p className="text-[13px] mt-2 relative z-10" style={{ color: '#64748B' }}>
                    Modern websites. Better visibility. More customers.
                </p>
                <div className="flex items-center justify-center gap-6 mt-6 relative z-10">
                    {([
                        { icon: Globe, text: 'Pro Websites' },
                        { icon: MapPin, text: 'Local SEO' },
                        { icon: TrendingUp, text: 'More Customers' },
                    ] as const).map(({ icon: Icon, text }) => (
                        <div key={text} className="flex items-center gap-1.5">
                            <Icon className="w-4 h-4" style={{ color: '#FF6A00' }} strokeWidth={2} />
                            <span className="text-xs font-medium" style={{ color: '#101828' }}>{text}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}


export const authFieldClass =
    'mt-1.5 w-full bg-white text-sm placeholder:text-[#94A3B8] focus:outline-none transition-colors'
    + ' rounded-[11px] border border-[#E2E8F0] px-4 py-[14px]'
    + ' focus:border-[#FF6A00] focus:ring-1 focus:ring-[#FF6A00]/25'
    + ' text-[#101828]';

export function AuthFieldWrap({ children }: { children: ReactNode; icon?: React.ComponentType<{ className?: string; strokeWidth?: number }> }) {
    return <div>{children}</div>;
}
