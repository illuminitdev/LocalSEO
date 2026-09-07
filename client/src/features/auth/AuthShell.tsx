import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Props = {
    children: ReactNode;
    title: string;
    subtitle: string;
    showSecureFooter?: boolean;
    showLegalFooter?: boolean;
};

export default function AuthShell({ children, title, subtitle, showLegalFooter = true }: Props) {
    return (
        <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center px-4 py-10">
            <div className="w-full max-w-[400px]">
                <div className="flex items-center justify-center gap-2.5 mb-8">
                    <div className="h-8 w-8 rounded-lg bg-[#EA580C] text-white flex items-center justify-center font-bold text-sm leading-none shrink-0">
                        z
                    </div>
                    <div className="leading-none text-left">
                        <p className="text-[15px] font-semibold text-[#0F172A] tracking-tight">Zappsites</p>
                        <p className="text-[10px] uppercase tracking-widest text-[#EA580C] mt-1.5">Local SEO</p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-[#E2E8F0] px-6 py-7 sm:px-8 sm:py-8">
                    <h1 className="text-xl font-semibold text-[#0F172A] tracking-tight">{title}</h1>
                    <p className="text-sm text-[#64748B] mt-1.5 leading-relaxed">{subtitle}</p>
                    <div className="mt-6">{children}</div>
                </div>

                {showLegalFooter && (
                    <p className="mt-6 text-center text-xs text-[#94A3B8] leading-relaxed">
                        <Link to="/privacy" className="hover:text-[#64748B] hover:underline">
                            Privacy
                        </Link>
                        {' · '}
                        <Link to="/terms" className="hover:text-[#64748B] hover:underline">
                            Terms
                        </Link>
                    </p>
                )}
            </div>
        </div>
    );
}

export const authFieldClass =
    'mt-1.5 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0F172A] focus:ring-1 focus:ring-[#0F172A]';

export function AuthFieldWrap({ children }: { children: ReactNode; icon?: React.ComponentType<{ className?: string; strokeWidth?: number }> }) {
    return <div>{children}</div>;
}
