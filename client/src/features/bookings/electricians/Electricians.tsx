import { useEffect, useState } from 'react';
import { apiGet } from '../../../shared/utils';
import BookingPlots from '../shared/BookingPlots';
import CustomerViewPortal, {
    type ShellEventType,
    type ShellMenuItem
} from '../shared/CustomerViewPortal';
import {
    getBookingPreset,
    normalizeBookingIndustryId,
    type BookingCustomField
} from '../shared/bookingIndustryPresets';

type HostBrand = {
    name: string;
    tradeType?: string;
    phone?: string;
    email?: string;
    serviceArea?: string;
    logoUrl?: string;
    brandPrimary?: string;
    brandSecondary?: string;
};

type IndustryConfig = {
    id?: string;
    name?: string;
    confirmationTitle?: string;
    customFields?: BookingCustomField[];
    uploadPrompt?: string;
    notesPlaceholder?: string;
};

type PortalProps = {
    hostSlug: string;
    host: HostBrand;
    eventTypes: ShellEventType[];
    menuItems?: ShellMenuItem[];
    industry?: IndustryConfig | null;
    mediaUploadsEnabled?: boolean;
    eventSlug?: string;
    onSuccess?: () => void;
};

/** Public customer booking flow for electricians. */
export function ElectriciansCustomerViewPortal(props: PortalProps) {
    const electriciansPreset = getBookingPreset('electricians');

    return (
        <CustomerViewPortal
            {...props}
            industry={{
                ...electriciansPreset,
                ...(props.industry || {}),
                id: 'electricians',
                customFields:
                    props.industry?.customFields || electriciansPreset.customFields || [],
                uploadPrompt: props.industry?.uploadPrompt || electriciansPreset.uploadPrompt,
                notesPlaceholder:
                    props.industry?.notesPlaceholder || electriciansPreset.notesPlaceholder,
                confirmationTitle:
                    props.industry?.confirmationTitle || electriciansPreset.confirmationTitle
            }}
        />
    );
}

function ElectriciansBookingBoard() {
    return <BookingPlots />;
}

/**
 * Authenticated /booking entry: electricians orgs get ElectriciansBookingBoard;
 * everyone else keeps the shared BookingPlots board.
 * Single electricians module for now — split later if needed.
 */
export default function BookingBoardRoute() {
    const [industryId, setIndustryId] = useState<string | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        apiGet('/api/auth/me')
            .then((me) => {
                const org = me?.organization || {};
                setIndustryId(
                    normalizeBookingIndustryId(org.booking_industry_id || org.trade_type) ||
                        String(org.booking_industry_id || org.trade_type || '').trim() ||
                        ''
                );
            })
            .catch((e: Error) => {
                setError(e.message || 'Could not load organization');
                setIndustryId('');
            });
    }, []);

    if (industryId === null) {
        return (
            <div className="min-h-[40vh] flex items-center justify-center text-[#64748B]">
                Loading booking board…
            </div>
        );
    }

    if (error && !industryId) {
        return (
            <div className="min-h-[40vh] flex items-center justify-center text-red-600 p-6">
                {error}
            </div>
        );
    }

    if (normalizeBookingIndustryId(industryId) === 'electricians') {
        return <ElectriciansBookingBoard />;
    }

    return <BookingPlots />;
}
