import { useEffect, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from './utils';


export const SIDEBAR_RAIL_WIDTH = 68;


export function useSidebarCollapsed(storageKey: string) {
    const [collapsed, setCollapsed] = useState(() => {
        try {
            return localStorage.getItem(storageKey) === '1';
        } catch {
            return false;
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem(storageKey, collapsed ? '1' : '0');
        } catch {  }
    }, [storageKey, collapsed]);

    return [collapsed, () => setCollapsed((c) => !c)] as const;
}

export function SidebarToggleButton({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
    const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
    const label = collapsed ? 'Open sidebar' : 'Close sidebar';
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'hidden lg:inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[#E2E8F0] bg-white',
                'text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A] transition-colors shrink-0'
            )}
            aria-label={label}
            aria-expanded={!collapsed}
            title={label}
        >
            <Icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
        </button>
    );
}
