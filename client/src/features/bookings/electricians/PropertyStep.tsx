import { ArrowRight, Building2, Check, Home, School, Store, Zap, type LucideIcon } from 'lucide-react';
import { cn } from '../../../shared/utils';
import {
    ELECTRICIAN_PROPERTY_OPTIONS,
    isOtherProperty,
    type ElectricianPropertyId
} from './propertyOptions';

const PROPERTY_ICONS: Record<ElectricianPropertyId, LucideIcon> = {
    house: Home,
    apartment: Building2,
    'shopping-mall': Store,
    school: School,
    other: Zap
};

type Props = {
    propertyType: ElectricianPropertyId | '';
    propertyOther: string;
    title?: string;
    hint?: string;
    showContinue?: boolean;
    continueDisabled?: boolean;
    continueLabel?: string;
    onPropertyTypeChange: (id: ElectricianPropertyId) => void;
    onPropertyOtherChange: (value: string) => void;
    onContinue?: () => void;
};

/** Electrician-only first step UI; calendar / details / pay stay in CustomerViewPortal. */
export default function PropertyStep({
    propertyType,
    propertyOther,
    title = 'What type of property?',
    hint = 'Choose where the electrical work is needed.',
    showContinue = false,
    continueDisabled = false,
    continueLabel = 'Continue',
    onPropertyTypeChange,
    onPropertyOtherChange,
    onContinue
}: Props) {
    return (
        <div className="space-y-5">
            <div>
                <p
                    className="text-[10px] font-black uppercase tracking-widest"
                    style={{ color: 'var(--brand-primary)' }}
                >
                    Book an appointment
                </p>
                <h2 className="text-2xl font-black text-[#0F172A] mt-1">{title}</h2>
                {hint ? <p className="text-sm text-[#64748B] mt-1">{hint}</p> : null}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {ELECTRICIAN_PROPERTY_OPTIONS.map((opt) => {
                    const Icon = PROPERTY_ICONS[opt.id];
                    const selected = propertyType === opt.id;
                    return (
                        <button
                            key={opt.id}
                            type="button"
                            onClick={() => onPropertyTypeChange(opt.id)}
                            className={cn(
                                'relative flex flex-col items-center gap-2 rounded-2xl border bg-white px-2 py-3.5 text-center shadow-sm transition',
                                selected
                                    ? 'border-[#0F172A] ring-1 ring-[#0F172A]'
                                    : 'border-[#E2E8F0] hover:border-[#CBD5E1]'
                            )}
                        >
                            {selected && (
                                <span
                                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full text-white shadow"
                                    style={{ background: 'var(--brand-primary)' }}
                                >
                                    <Check className="h-3 w-3" strokeWidth={3} />
                                </span>
                            )}
                            <Icon className="h-7 w-7" style={{ color: 'var(--brand-primary)' }} />
                            <span className="text-xs font-bold text-[#0F172A] leading-tight">
                                {opt.label}
                            </span>
                        </button>
                    );
                })}
            </div>
            {isOtherProperty(propertyType) && (
                <label className="block max-w-md">
                    <span className="text-xs font-bold text-[#64748B]">Describe the place *</span>
                    <input
                        value={propertyOther}
                        onChange={(e) => onPropertyOtherChange(e.target.value)}
                        placeholder="e.g. Warehouse, church, office park…"
                        className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
                    />
                </label>
            )}
            {showContinue && onContinue && (
                <button
                    type="button"
                    disabled={continueDisabled}
                    onClick={onContinue}
                    className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black disabled:opacity-40 text-[var(--brand-secondary)] bg-[var(--brand-primary)]"
                >
                    {continueLabel} <ArrowRight className="w-4 h-4" />
                </button>
            )}
        </div>
    );
}
