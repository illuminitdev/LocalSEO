import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useState,
    type CSSProperties,
    type ReactNode
} from 'react';
import { apiGet } from './utils';
import { getToken } from '../features/auth/auth';
import {
    clearOrgBrandCache,
    DEFAULT_BRAND_PRIMARY,
    DEFAULT_BRAND_SECONDARY,
    normalizeBrandHex,
    orgBrandStyle,
    preloadBrandLogo,
    readOrgBrandCache,
    writeOrgBrandCache,
    type OrgBrand
} from './orgBrand';

export type OrgBrandState = {
    logoUrl: string;
    brandPrimary: string;
    brandSecondary: string;
    loading: boolean;
    /** True once this session already knows the org brand (cache or /api/auth/me). */
    resolved: boolean;
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

function initialBrand() {
    return (
        readOrgBrandCache(getToken()) || {
            logoUrl: '',
            brandPrimary: DEFAULT_BRAND_PRIMARY,
            brandSecondary: DEFAULT_BRAND_SECONDARY
        }
    );
}

export function OrgBrandProvider({ children }: { children: ReactNode }) {
    const [logoUrl, setLogoUrl] = useState(() => initialBrand().logoUrl);
    const [brandPrimary, setBrandPrimary] = useState(() => initialBrand().brandPrimary);
    const [brandSecondary, setBrandSecondary] = useState(() => initialBrand().brandSecondary);
    const [loading, setLoading] = useState(true);
    const [resolved, setResolved] = useState(() => readOrgBrandCache(getToken()) !== null);

    const applyBrand = useCallback((next: OrgBrand) => {
        const brand = readBrand(next);
        setLogoUrl(brand.logoUrl || '');
        setBrandPrimary(brand.brandPrimary);
        setBrandSecondary(brand.brandSecondary);
        const token = getToken();
        if (token) {
            writeOrgBrandCache(token, brand);
            if (brand.logoUrl) preloadBrandLogo(brand.logoUrl);
        } else {
            clearOrgBrandCache();
        }
    }, []);

    const refresh = useCallback(async () => {
        if (!getToken()) {
            applyBrand({});
            setResolved(true);
            setLoading(false);
            return;
        }
        try {
            const me = await apiGet('/api/auth/me');
            applyBrand(me.organization || {});
        } catch {
            
        } finally {
            setResolved(true);
            setLoading(false);
        }
    }, [applyBrand]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    // Clear any leftover document brand overrides so the host client portal stays on defaults.
    // Customer booking UIs scope colors via orgBrandStyle() + .portal-brand on their root.
    useLayoutEffect(() => {
<<<<<<< HEAD
        const root = document.documentElement;
        root.style.removeProperty('--brand-primary');
        root.style.removeProperty('--brand-secondary');
        root.style.removeProperty('--color-orange');
        root.style.removeProperty('--color-orange-dark');
    }, []);
=======
        applyDocumentBrandVars(brandPrimary, brandSecondary);
        return () => {
            const root = document.documentElement;
            root.style.removeProperty('--brand-primary');
            root.style.removeProperty('--brand-primary-foreground');
            root.style.removeProperty('--brand-secondary');
            root.style.removeProperty('--color-orange');
            root.style.removeProperty('--color-orange-dark');
        };
    }, [brandPrimary, brandSecondary]);
>>>>>>> 392864c180fd900e9d381e42be72504a811de28e

    const value = useMemo<OrgBrandState>(
        () => ({
            logoUrl,
            brandPrimary,
            brandSecondary,
            loading,
            resolved,
            refresh,
            applyBrand,
            // Defaults only — host UI stays on LocalPulse amber; Account preview uses orgBrandStyle locally.
            brandStyle: orgBrandStyle({})
        }),
        [logoUrl, brandPrimary, brandSecondary, loading, resolved, refresh, applyBrand]
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
            resolved: true,
            refresh: async () => {},
            applyBrand: () => {},
            brandStyle: orgBrandStyle({})
        } satisfies OrgBrandState;
    }
    return ctx;
}

const bootBrand = readOrgBrandCache(getToken());
if (bootBrand?.logoUrl) {
    preloadBrandLogo(bootBrand.logoUrl);
}
