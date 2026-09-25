export const ELECTRICIAN_PROPERTY_OPTIONS = [
    { id: 'house', label: 'House' },
    { id: 'apartment', label: 'Apartment' },
    { id: 'shopping-mall', label: 'Shopping mall' },
    { id: 'school', label: 'School' },
    { id: 'other', label: 'Other' }
] as const;

export type ElectricianPropertyId = (typeof ELECTRICIAN_PROPERTY_OPTIONS)[number]['id'];

export function isOtherProperty(id: string | null | undefined): boolean {
    return id === 'other';
}

export function propertyDisplayLabel(
    propertyType: string | null | undefined,
    propertyOther?: string | null
): string {
    if (!propertyType) return '';
    if (propertyType === 'other') {
        const other = String(propertyOther || '').trim();
        return other ? `Other — ${other}` : 'Other';
    }
    const found = ELECTRICIAN_PROPERTY_OPTIONS.find((o) => o.id === propertyType);
    return found?.label || propertyType;
}

export function isElectricianPropertyId(id: string | null | undefined): id is ElectricianPropertyId {
    return ELECTRICIAN_PROPERTY_OPTIONS.some((o) => o.id === id);
}
