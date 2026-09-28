import {
    getBookingPreset,
    type BookingIndustryPreset
} from './bookingIndustryPresets';

export type TradeEventTypeTemplate = {
    slugBase: string;
    name: string;
    description: string;
    durationMinutes: number;
    sortOrder: number;
    kind: 'standard' | 'emergency';
    category?: string;
    freeDeposit?: boolean;
};

export type TradeBookingCatalogEntry = {
    tradeType: string;
    bookingIndustryId: string;
    standardDeposit: number;
    emergencyDeposit: number;
    acceptingEmergencies: boolean;
    emergencyNote: string;
    eventTypes: TradeEventTypeTemplate[];
};

export function isFreeDepositService(name: string): boolean {
    return /\bfree\b|\(£0\)|\(0\)/i.test(String(name || ''));
}

/** New booking orgs start with zero event types; hosts add services themselves. */
function catalogFromPreset(preset: BookingIndustryPreset): TradeBookingCatalogEntry {
    return {
        tradeType: preset.name,
        bookingIndustryId: preset.id,
        standardDeposit: 45,
        emergencyDeposit: 60,
        acceptingEmergencies: preset.id !== 'salons',
        emergencyNote: '',
        eventTypes: []
    };
}

const GENERIC: TradeBookingCatalogEntry = {
    tradeType: '',
    bookingIndustryId: 'small-business',
    standardDeposit: 45,
    emergencyDeposit: 60,
    acceptingEmergencies: true,
    emergencyNote: '',
    eventTypes: []
};

export function getTradeBookingCatalog(
    tradeType: string | null | undefined,
    bookingIndustryId?: string | null
): TradeBookingCatalogEntry {
    const industryHint = String(bookingIndustryId || tradeType || '').trim();
    if (!industryHint) return GENERIC;
    const preset = getBookingPreset(industryHint);
    return catalogFromPreset(preset);
}
