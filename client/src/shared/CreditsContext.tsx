import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiGet } from './utils';
import { getToken } from '../features/auth/auth';
import { useEntitlements } from './EntitlementsContext';
import { CREDIT_COSTS, type CreditFeature } from './planCatalog';

export type CreditsSummary = {
    unlimited: boolean;
    planId: string | null;
    allowance: number;
    used: number;
    remaining: number;
    periodStart: string | null;
    periodEnd: string | null;
    costs: Record<CreditFeature, number>;
    breakdown: Array<{ feature: string; credits: number }>;
};

type CreditsState = {
    summary: CreditsSummary | null;
    loading: boolean;
    /** Plans with a credit pool (hidden for dev bypass and booking-only plans). */
    hasPool: boolean;
    refresh: () => Promise<void>;
    costOf: (feature: CreditFeature, count?: number) => number;
};

const CreditsContext = createContext<CreditsState | null>(null);

export function CreditsProvider({ children }: { children: ReactNode }) {
    const { planId, loading: entitlementsLoading } = useEntitlements();
    const [summary, setSummary] = useState<CreditsSummary | null>(null);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        if (!getToken()) {
            setSummary(null);
            return;
        }
        setLoading(true);
        try {
            setSummary(await apiGet('/api/credits'));
        } catch {
            setSummary(null);
        } finally {
            setLoading(false);
        }
    }, []);

    // Reload after login, logout and plan changes.
    useEffect(() => {
        if (entitlementsLoading) return;
        void refresh();
    }, [planId, entitlementsLoading, refresh]);

    const value = useMemo<CreditsState>(
        () => ({
            summary,
            loading,
            hasPool: Boolean(summary && !summary.unlimited && summary.allowance > 0),
            refresh,
            costOf: (feature, count = 1) => (summary?.costs?.[feature] ?? CREDIT_COSTS[feature]) * count
        }),
        [summary, loading, refresh]
    );

    return <CreditsContext.Provider value={value}>{children}</CreditsContext.Provider>;
}

export function useCredits() {
    const ctx = useContext(CreditsContext);
    if (!ctx) throw new Error('useCredits must be used within CreditsProvider');
    return ctx;
}
