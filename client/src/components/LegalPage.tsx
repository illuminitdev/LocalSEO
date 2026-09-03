import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Props = {
    children: ReactNode;
    title: string;
};

/** Simple legal / static page shell matching auth look. */
export default function LegalPage({ title, children }: Props) {
    return (
        <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
            <header className="border-b border-[#E2E8F0] bg-white">
                <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
                    <Link to="/" className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-[#EA580C] text-white flex items-center justify-center font-bold text-sm shrink-0">
                            z
                        </div>
                        <div className="leading-none">
                            <p className="text-[15px] font-semibold tracking-tight">Zappsites</p>
                            <p className="text-[10px] uppercase tracking-widest text-[#EA580C] mt-1.5">Local SEO</p>
                        </div>
                    </Link>
                    <Link to="/" className="text-sm font-medium text-[#64748B] hover:text-[#0F172A]">
                        Sign in
                    </Link>
                </div>
            </header>
            <main className="max-w-2xl mx-auto px-4 py-10">
                <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
                <p className="mt-1 text-xs text-[#94A3B8]">Last updated: 2 September 2026 · Placeholder — replace with final legal copy.</p>
                <div className="mt-8 space-y-5 text-sm text-[#334155] leading-relaxed">{children}</div>
                <p className="mt-10 text-xs text-[#94A3B8]">
                    <Link to="/privacy" className="hover:underline">Privacy</Link>
                    {' · '}
                    <Link to="/terms" className="hover:underline">Terms</Link>
                    {' · '}
                    <a href="https://www.zappsites.com/" className="hover:underline" target="_blank" rel="noreferrer">
                        zappsites.com
                    </a>
                </p>
            </main>
        </div>
    );
}
