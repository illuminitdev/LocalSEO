import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiGet, apiPatch } from '../lib/utils';
import { getToken } from '../lib/auth';
import type { FeatureKey } from '../lib/planCatalog';

export type EntitlementsState = {
    planId: string | null;
    planName: string | null;
    features: FeatureKey[];
    subscriptionStatus: string | null;
    priceLabel: string | null;
    entitlementsDisabled: boolean;
    loading: boolean;
    hasFeature: (key: FeatureKey) => boolean;
    hasAllFeatures: (keys: FeatureKey[]) => boolean;
    refresh: () => Promise<void>;
    simulatePlan: (planId: string) => Promise<void>;
};

const EntitlementsContext = createContext<EntitlementsState | null>(null);

export function EntitlementsProvider({ children }: { children: ReactNode }) {
    const [planId, setPlanId] = useState<string | null>(null);
    const [planName, setPlanName] = useState<string | null>(null);
    const [features, setFeatures] = useState<FeatureKey[]>([]);
    const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
    const [priceLabel, setPriceLabel] = useState<string | null>(null);
    const [entitlementsDisabled, setEntitlementsDisabled] = useState(false);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        const token = getToken();
        if (!token) {
            setPlanId(null);
            setPlanName(null);
            setFeatures([]);
            setSubscriptionStatus(null);
            setPriceLabel(null);
            setEntitlementsDisabled(false);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const data = await apiGet('/api/auth/entitlements');
            setPlanId(data.planId ?? null);
            setPlanName(data.planName ?? null);
            setFeatures(Array.isArray(data.features) ? data.features : []);
            setSubscriptionStatus(data.subscriptionStatus ?? null);
            setPriceLabel(data.priceLabel ?? null);
            setEntitlementsDisabled(Boolean(data.entitlementsDisabled));
        } catch {
            setPlanId(null);
            setPlanName(null);
            setFeatures([]);
            setSubscriptionStatus(null);
            setPriceLabel(null);
        } finally {
            setLoading(false);
        }
    }, []);

    const simulatePlan = useCallback(async (nextPlanId: string) => {
        await apiPatch('/api/auth/dev/subscription', { planId: nextPlanId });
        await refresh();
    }, [refresh]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const value = useMemo<EntitlementsState>(() => ({
        planId,
        planName,
        features,
        subscriptionStatus,
        priceLabel,
        entitlementsDisabled,
        loading,
        hasFeature: (key) => entitlementsDisabled || features.includes(key),
        hasAllFeatures: (keys) => entitlementsDisabled || keys.every((k) => features.includes(k)),
        refresh,
        simulatePlan
    }), [planId, planName, features, subscriptionStatus, priceLabel, entitlementsDisabled, loading, refresh, simulatePlan]);

    return (
        <EntitlementsContext.Provider value={value}>
            {children}
        </EntitlementsContext.Provider>
    );
}

export function useEntitlements() {
    const ctx = useContext(EntitlementsContext);
    if (!ctx) throw new Error('useEntitlements must be used within EntitlementsProvider');
    return ctx;
}
