import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

export type InfoText = { title: string; body: string[] };

const INFO_WIDTH = 280;

/** Small (i) icon that opens a small explainer on hover, or stays open on click until clicked again or outside. */
export function InfoTip({ info }: { info: InfoText }) {
    const ref = useRef<HTMLButtonElement>(null);
    const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);
    const [pinned, setPinned] = useState(false);
    const place = () => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        const left = Math.max(8, Math.min(window.innerWidth - INFO_WIDTH - 8, r.left + r.width / 2 - INFO_WIDTH / 2));
        const above = r.bottom + 200 > window.innerHeight;
        setPos({ left, top: above ? r.top - 6 : r.bottom + 6, above });
    };
    useEffect(() => {
        if (!pinned) return;
        const close = (e: Event) => {
            if (e.type === 'mousedown' && ref.current?.contains(e.target as Node)) return;
            setPinned(false);
            setPos(null);
        };
        document.addEventListener('mousedown', close);
        window.addEventListener('scroll', close, true);
        return () => {
            document.removeEventListener('mousedown', close);
            window.removeEventListener('scroll', close, true);
        };
    }, [pinned]);
    return (
        <>
            <button
                ref={ref}
                type="button"
                aria-label={`What is ${info.title}?`}
                onMouseEnter={place}
                onMouseLeave={() => !pinned && setPos(null)}
                onClick={() => {
                    if (pinned) {
                        setPinned(false);
                        setPos(null);
                    } else {
                        place();
                        setPinned(true);
                    }
                }}
                className="pdf-hide inline-flex items-center justify-center w-4 h-4 rounded-full text-slate-400 hover:text-[var(--brand-primary)] cursor-pointer"
            >
                <Info className="w-3.5 h-3.5" />
            </button>
            {pos &&
                createPortal(
                    <div
                        role="tooltip"
                        style={{ left: pos.left, top: pos.top, width: INFO_WIDTH, transform: pos.above ? 'translateY(-100%)' : undefined }}
                        className="fixed z-50 rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-3 shadow-lg text-left"
                    >
                        <div className="flex items-center gap-1.5 text-xs font-bold text-[#0F172A]">
                            <Info className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                            {info.title}
                        </div>
                        {info.body.map((t, i) => (
                            <p key={i} className="mt-1.5 text-[11px] leading-snug text-slate-600">
                                {t}
                            </p>
                        ))}
                    </div>,
                    document.body
                )}
        </>
    );
}
