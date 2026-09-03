import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { FEATURE_LABELS, getRequiredPlanHint, type FeatureKey } from '../lib/planCatalog';
import { useEntitlements } from '../context/EntitlementsContext';

type Props = {
    feature?: FeatureKey;
    features?: FeatureKey[];
};

export default function UpgradeRequired({ feature, features }: Props) {
    const { planId, planName } = useEntitlements();
    const missing = features?.length ? features : feature ? [feature] : [];
    const hintFeature = missing[0];
    const hint = hintFeature ? getRequiredPlanHint(hintFeature) : null;

    if (planId === 'website-essential') {
        return (
            <div className="max-w-lg mx-auto mt-16 text-center px-4">
                <div className="w-14 h-14 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-center mx-auto mb-4">
                    <Lock className="w-6 h-6 text-[#64748B]" />
                </div>
                <h1 className="text-xl font-bold text-[#0F172A]">Website plan — local tools not included</h1>
                <p className="text-sm text-[#64748B] mt-2 leading-relaxed">
                    Your {planName || 'Website Essential'} plan covers your website. Local SEO and booking tools are available on other ZappSites plans.
                </p>
                <Link
                    to="/account"
                    className="inline-block mt-6 px-5 py-2.5 rounded-xl bg-[#0F172A] text-white text-sm font-semibold hover:bg-[#1E293B]"
                >
                    View your plan
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-lg mx-auto mt-16 text-center px-4">
            <div className="w-14 h-14 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-center mx-auto mb-4">
                <Lock className="w-6 h-6 text-[#64748B]" />
            </div>
            <h1 className="text-xl font-bold text-[#0F172A]">Upgrade required</h1>
            <p className="text-sm text-[#64748B] mt-2 leading-relaxed">
                {missing.length
                    ? `This tool needs: ${missing.map((f) => FEATURE_LABELS[f]).join(', ')}.`
                    : 'Your current plan does not include this feature.'}
            </p>
            {hint && (
                <p className="text-sm text-[#0F172A] mt-3 font-medium">
                    Available on the {hint.planName} plan and above.
                </p>
            )}
            <Link
                to="/account"
                className="inline-block mt-6 px-5 py-2.5 rounded-xl bg-[#0F172A] text-white text-sm font-semibold hover:bg-[#1E293B]"
            >
                View your plan
            </Link>
        </div>
    );
}
