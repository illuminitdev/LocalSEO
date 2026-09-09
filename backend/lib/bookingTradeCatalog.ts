/**
 * Per-trade booking board templates.
 * Only Plumbing (Emergency Plumber) is implemented for now — extend when more trades are ready.
 */

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
    standardDeposit: number;
    emergencyDeposit: number;
    acceptingEmergencies: boolean;
    emergencyNote: string;
    eventTypes: TradeEventTypeTemplate[];
};

const GENERIC: TradeBookingCatalogEntry = {
    tradeType: '',
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

const PLUMBER: TradeBookingCatalogEntry = {
    tradeType: 'Emergency Plumber',
    standardDeposit: 45,
    emergencyDeposit: 60,
    acceptingEmergencies: true,
    emergencyNote: 'Burst pipes and active leaks get emergency windows.',
    eventTypes: [
        {
            slugBase: 'plumbing-visit',
            name: 'Plumbing Visit',
            description: 'Scheduled leaks, pipes, and general plumbing work',
            durationMinutes: 60,
            sortOrder: 0,
            kind: 'standard'
        },
        {
            slugBase: 'emergency-leak-callout',
            name: 'Emergency Leak / Burst',
            description: 'Urgent same-day plumbing — burst pipes and active leaks',
            durationMinutes: 90,
            sortOrder: 1,
            kind: 'emergency'
        }
    ]
};

const BY_TRADE: Record<string, TradeBookingCatalogEntry> = {
    [PLUMBER.tradeType]: PLUMBER
};

export function getTradeBookingCatalog(tradeType: string | null | undefined): TradeBookingCatalogEntry {
    const key = String(tradeType || '').trim();
    if (key && BY_TRADE[key]) return BY_TRADE[key];
    // Soft match for plumber variants
    if (/plumb/i.test(key)) return PLUMBER;
    return GENERIC;
}
