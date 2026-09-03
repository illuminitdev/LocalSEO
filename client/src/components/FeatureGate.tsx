import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useEntitlements } from '../context/EntitlementsContext';
import type { FeatureKey } from '../lib/planCatalog';

type Props = {
    feature?: FeatureKey;
    features?: FeatureKey[];
    children: ReactNode;
};

/** Hide unauthorized modules — redirect instead of showing upgrade/lock UI. */
export default function FeatureGate({ feature, features, children }: Props) {
    const { loading, hasFeature, hasAllFeatures } = useEntitlements();

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24 text-sm text-[#64748B]">
                Loading…
            </div>
        );
    }

    const allowed = features?.length
        ? hasAllFeatures(features)
        : feature
          ? hasFeature(feature)
          : true;

    if (!allowed) {
        return <Navigate to="/dashboard" replace />;
    }

    return <>{children}</>;
}
