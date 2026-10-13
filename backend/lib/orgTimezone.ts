/** UK businesses use a single civil timezone (GMT/BST). */
export const UK_BUSINESS_TIMEZONE = 'Europe/London';

const UK_HINT =
    /\b(uk|u\.k\.|united kingdom|great britain|england|scotland|wales|northern ireland|london|manchester|birmingham|leeds|glasgow|edinburgh|bristol|liverpool|sheffield|newcastle|cardiff|belfast|nottingham|leicester|coventry|brighton|oxford|cambridge|gb)\b/i;


export function resolveOrgTimezone(org: any): string {
    const stored = String(org?.timezone || '').trim();
    const place = [
        org?.service_area,
        org?.serviceArea,
        org?.address,
        org?.city,
        org?.country,
        org?.name
    ]
        .filter(Boolean)
        .join(' ');

    if (!stored || stored === 'UTC' || stored === 'Etc/UTC' || stored === 'GMT') {
        return UK_BUSINESS_TIMEZONE;
    }
    if (
        stored === UK_BUSINESS_TIMEZONE ||
        stored === 'Europe/Belfast' ||
        stored === 'GB' ||
        stored === 'GB-Eire' ||
        UK_HINT.test(place) ||
        UK_HINT.test(stored)
    ) {
        return UK_BUSINESS_TIMEZONE;
    }
    // Product default: booking board + customer portal always run on UK time.
    return UK_BUSINESS_TIMEZONE;
}
