/**
 * Per-industry booking board templates — seeded from bookingIndustryPresets.
 */

import {
    getBookingPreset,
    slugifyServiceName,
    type BookingIndustryPreset
} from './bookingIndustryPresets';

export type TradeEventTypeTemplate = {
    slugBase: string;
    name: string;
    description: string;
    durationMinutes: number;
    sortOrder: number;
    kind: 'standard' | 'emergency';
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

function isEmergencyService(name: string): boolean {
    return /emergency|call-?out|express/i.test(name);
}

function catalogFromPreset(preset: BookingIndustryPreset): TradeBookingCatalogEntry {
    const eventTypes: TradeEventTypeTemplate[] = preset.services.map((name, index) => {
        const emergency = isEmergencyService(name);
        return {
            slugBase: slugifyServiceName(name),
            name,
            description: name,
            durationMinutes: emergency ? 90 : 60,
            sortOrder: index,
            kind: emergency ? 'emergency' : 'standard'
        };
    });

    return {
        tradeType: preset.name,
        bookingIndustryId: preset.id,
        standardDeposit: 45,
        emergencyDeposit: 60,
        acceptingEmergencies: eventTypes.some((t) => t.kind === 'emergency'),
        emergencyNote: '',
        eventTypes
    };
}

const GENERIC: TradeBookingCatalogEntry = {
    tradeType: '',
    bookingIndustryId: 'small-business',
    standardDeposit: 45,
    emergencyDeposit: 60,
    acceptingEmergencies: true,
    emergencyNote: '',
    eventTypes: [
        {
            slugBase: 'standard-visit',
            name: 'Standard Visit',
            description: 'Regular scheduled appointment',
            durationMinutes: 60,
            sortOrder: 0,
            kind: 'standard'
        },
        {
            slugBase: 'emergency-callout',
            name: 'Emergency Callout',
            description: 'Urgent same-day service',
            durationMinutes: 90,
            sortOrder: 1,
            kind: 'emergency'
        }
    ]
};

/**
 * Resolve catalog from booking industry id and/or trade_type label.
 */
export function getTradeBookingCatalog(
    tradeType: string | null | undefined,
    bookingIndustryId?: string | null
): TradeBookingCatalogEntry {
    const industryHint = String(bookingIndustryId || tradeType || '').trim();
    if (!industryHint) return GENERIC;
    const preset = getBookingPreset(industryHint);
    return catalogFromPreset(preset);
}
