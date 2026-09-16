


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

function isEmergencyService(name: string): boolean {
    return /emergency|call-?out|express/i.test(name);
}

export function isFreeDepositService(name: string): boolean {
    return /\bfree\b|\(£0\)|\(0\)/i.test(String(name || ''));
}

function catalogFromPreset(preset: BookingIndustryPreset): TradeBookingCatalogEntry {
    
    if (preset.id === 'salons') {
        return {
            tradeType: preset.name,
            bookingIndustryId: preset.id,
            standardDeposit: 45,
            emergencyDeposit: 60,
            acceptingEmergencies: false,
            emergencyNote: '',
            eventTypes: []
        };
    }

    const categorized = preset.categorizedServices;
    const eventTypes: TradeEventTypeTemplate[] =
        categorized && categorized.length > 0
            ? categorized.map((s, index) => ({
                  slugBase: slugifyServiceName(s.name),
                  name: s.name,
                  description: s.name,
                  durationMinutes: s.durationMinutes ?? (isEmergencyService(s.name) ? 90 : 60),
                  sortOrder: index,
                  kind: isEmergencyService(s.name) ? 'emergency' : 'standard',
                  category: String(s.category || '').trim(),
                  freeDeposit: isFreeDepositService(s.name)
              }))
            : preset.services.map((name, index) => {
                  const emergency = isEmergencyService(name);
                  return {
                      slugBase: slugifyServiceName(name),
                      name,
                      description: name,
                      durationMinutes: emergency ? 90 : 60,
                      sortOrder: index,
                      kind: emergency ? ('emergency' as const) : ('standard' as const),
                      category: '',
                      freeDeposit: isFreeDepositService(name)
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
            kind: 'standard',
            category: ''
        },
        {
            slugBase: 'emergency-callout',
            name: 'Emergency Callout',
            description: 'Urgent same-day service',
            durationMinutes: 90,
            sortOrder: 1,
            kind: 'emergency',
            category: ''
        }
    ]
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
