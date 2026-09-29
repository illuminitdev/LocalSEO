export type EmailShareStatus = 'none' | 'sent' | 'opened';

export function emailShareStatusLabel(
    status?: EmailShareStatus | null
): 'Sent' | 'Opened' | null {
    if (status === 'opened') return 'Opened';
    if (status === 'sent') return 'Sent';
    return null;
}

export function emailShareStatusHint(status?: EmailShareStatus | null): string {
    if (status === 'opened') {
        return 'They opened the email (images loaded) or clicked the report link';
    }
    if (status === 'sent') {
        return 'Waiting — turns Opened when they display images or click “View full audit report”. Opening the PDF attachment alone is not tracked.';
    }
    return '';
}
