import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type CSSProperties,
    type ReactNode
} from 'react';
import { apiGet } from './utils';
import { getToken } from '../features/auth/auth';
import {
    DEFAULT_BRAND_PRIMARY,
    DEFAULT_BRAND_SECONDARY,
    normalizeBrandHex,
    orgBrandStyle,
    type OrgBrand
} from './orgBrand';

export type OrgBrandState = {
    logoUrl: string;
    brandPrimary: string;
    brandSecondary: string;
    loading: boolean;
    refresh: () => Promise<void>;
    applyBrand: (next: OrgBrand) => void;
    brandStyle: CSSProperties;
};

const OrgBrandContext = createContext<OrgBrandState | null>(null);

function readBrand(org: any): { logoUrl: string; brandPrimary: string; brandSecondary: string } {
    return {
        logoUrl: String(org?.logo_url || org?.logoUrl || '').trim(),
        brandPrimary: normalizeBrandHex(
            org?.brand_primary || org?.brandPrimary || '',
            DEFAULT_BRAND_PRIMARY
        ),
        brandSecondary: normalizeBrandHex(
            org?.brand_secondary || org?.brandSecondary || '',
            DEFAULT_BRAND_SECONDARY
        )
    };
}

export function OrgBrandProvider({ children }: { children: ReactNode }) {
    const [logoUrl, setLogoUrl] = useState('');
    const [brandPrimary, setBrandPrimary] = useState(DEFAULT_BRAND_PRIMARY);
    const [brandSecondary, setBrandSecondary] = useState(DEFAULT_BRAND_SECONDARY);
    const [loading, setLoading] = useState(true);

    const applyBrand = useCallback((next: OrgBrand) => {
        const resolved = readBrand(next);
        setLogoUrl(resolved.logoUrl || '');
        setBrandPrimary(resolved.brandPrimary);
        setBrandSecondary(resolved.brandSecondary);
    }, []);

    const refresh = useCallback(async () => {
        if (!getToken()) {
            applyBrand({});
            setLoading(false);
            return;
        }
        try {
            const me = await apiGet('/api/auth/me');
            applyBrand(me.organization || {});
        } catch {
            
        } finally {
            setLoading(false);
        }
    }, [applyBrand]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useEffect(() => {
        const root = document.documentElement;
        root.style.setProperty('--brand-primary', brandPrimary);
        root.style.setProperty('--brand-secondary', brandSecondary);
        root.style.setProperty('--color-orange', brandPrimary);
        root.style.setProperty('--color-orange-dark', brandPrimary);
        return () => {
            root.style.removeProperty('--brand-primary');
            root.style.removeProperty('--brand-secondary');
            root.style.removeProperty('--color-orange');
            root.style.removeProperty('--color-orange-dark');
        };
    }, [brandPrimary, brandSecondary]);

    const value = useMemo<OrgBrandState>(
        () => ({
            logoUrl,
            brandPrimary,
            brandSecondary,
            loading,
            refresh,
            applyBrand,
            brandStyle: orgBrandStyle({ logoUrl, brandPrimary, brandSecondary })
        }),
        [logoUrl, brandPrimary, brandSecondary, loading, refresh, applyBrand]
    );

    return <OrgBrandContext.Provider value={value}>{children}</OrgBrandContext.Provider>;
}

export function useOrgBrand() {
    const ctx = useContext(OrgBrandContext);
    if (!ctx) {
        return {
            logoUrl: '',
            brandPrimary: DEFAULT_BRAND_PRIMARY,
            brandSecondary: DEFAULT_BRAND_SECONDARY,
            loading: false,
            refresh: async () => {},
            applyBrand: () => {},
            brandStyle: orgBrandStyle({})
        } satisfies OrgBrandState;
    }
    return ctx;
}
