import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiGet, apiPatch } from '../lib/utils';
import { getToken } from '../lib/auth';
import type { FeatureKey } from '../lib/planCatalog';

export type ActiveSubscription = {
    id: string;
    planId: string;
    planName: string;
    priceCents: number | null;
    currency: string | null;
    priceLabel: string | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    status: string;
};

export type EntitlementsState = {
    planId: string | null;
    planName: string | null;
    features: FeatureKey[];
    subscriptionStatus: string | null;
    priceLabel: string | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    autopayEnabled: boolean;
    activeSubscriptions: ActiveSubscription[];
    entitlementsDisabled: boolean;
    loading: boolean;
    hasFeature: (key: FeatureKey) => boolean;
    hasAllFeatures: (keys: FeatureKey[]) => boolean;
    refresh: () => Promise<void>;
    simulatePlan: (planId: string) => Promise<void>;
    setAutopay: (enabled: boolean) => Promise<void>;
};

const EntitlementsContext = createContext<EntitlementsState | null>(null);

export function EntitlementsProvider({ children }: { children: ReactNode }) {
    const [planId, setPlanId] = useState<string | null>(null);
    const [planName, setPlanName] = useState<string | null>(null);
    const [features, setFeatures] = useState<FeatureKey[]>([]);
    const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
    const [priceLabel, setPriceLabel] = useState<string | null>(null);
    const [currentPeriodStart, setCurrentPeriodStart] = useState<string | null>(null);
    const [currentPeriodEnd, setCurrentPeriodEnd] = useState<string | null>(null);
    const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
    const [autopayEnabled, setAutopayEnabled] = useState(true);
    const [activeSubscriptions, setActiveSubscriptions] = useState<ActiveSubscription[]>([]);
    const [entitlementsDisabled, setEntitlementsDisabled] = useState(false);
    const [loading, setLoading] = useState(true);

    const applyEntitlements = (data: any) => {
        setPlanId(data.planId ?? null);
        setPlanName(data.planName ?? null);
        setFeatures(Array.isArray(data.features) ? data.features : []);
        setSubscriptionStatus(data.subscriptionStatus ?? null);
        setPriceLabel(data.priceLabel ?? null);
        setCurrentPeriodStart(data.currentPeriodStart ?? null);
        setCurrentPeriodEnd(data.currentPeriodEnd ?? null);
        setCancelAtPeriodEnd(Boolean(data.cancelAtPeriodEnd));
        setAutopayEnabled(data.autopayEnabled !== false && !data.cancelAtPeriodEnd);
        setActiveSubscriptions(Array.isArray(data.activeSubscriptions) ? data.activeSubscriptions : []);
        setEntitlementsDisabled(Boolean(data.entitlementsDisabled));
    };

    const clearEntitlements = () => {
        setPlanId(null);
        setPlanName(null);
        setFeatures([]);
        setSubscriptionStatus(null);
        setPriceLabel(null);
        setCurrentPeriodStart(null);
        setCurrentPeriodEnd(null);
        setCancelAtPeriodEnd(false);
        setAutopayEnabled(true);
        setActiveSubscriptions([]);
        setEntitlementsDisabled(false);
    };

    const refresh = useCallback(async () => {
        const token = getToken();
        if (!token) {
            clearEntitlements();
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const data = await apiGet('/api/auth/entitlements');
            applyEntitlements(data);
        } catch {
            clearEntitlements();
        } finally {
            setLoading(false);
        }
    }, []);

    const simulatePlan = useCallback(async (nextPlanId: string) => {
        await apiPatch('/api/auth/dev/subscription', { planId: nextPlanId });
        await refresh();
    }, [refresh]);

    const setAutopay = useCallback(async (enabled: boolean) => {
        await apiPatch('/api/auth/subscription/autopay', { enabled });
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
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        autopayEnabled,
        activeSubscriptions,
        entitlementsDisabled,
        loading,
        hasFeature: (key) => entitlementsDisabled || features.includes(key),
        hasAllFeatures: (keys) => entitlementsDisabled || keys.every((k) => features.includes(k)),
        refresh,
        simulatePlan,
        setAutopay
    }), [
        planId,
        planName,
        features,
        subscriptionStatus,
        priceLabel,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        autopayEnabled,
        activeSubscriptions,
        entitlementsDisabled,
        loading,
        refresh,
        simulatePlan,
        setAutopay
    ]);

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
