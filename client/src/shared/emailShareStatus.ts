export type EmailShareStatus = 'none' | 'sent' | 'opened';

export function emailShareStatusLabel(
    status?: EmailShareStatus | null
): 'Sent' | 'Opened' | null {
    if (status === 'opened') return 'Opened';
    if (status === 'sent') return 'Sent';
    return null;
}

export function formatEmailShareDateTime(value?: string | null): string {
    if (!value) return '';
    try {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
    } catch {
        return '';
    }
}

export type EmailShareTimes = {
    sentAt?: string | null;
    openedAt?: string | null;
};

/** Tooltip / title text with sent + opened timestamps when available. */
export function emailShareStatusHint(
    status?: EmailShareStatus | null,
    times?: EmailShareTimes | null
): string {
    const sentFmt = formatEmailShareDateTime(times?.sentAt);
    const openedFmt = formatEmailShareDateTime(times?.openedAt);
    const timeParts: string[] = [];
    if (sentFmt) timeParts.push(`Sent: ${sentFmt}`);
    if (openedFmt) timeParts.push(`Opened: ${openedFmt}`);
    const timeLine = timeParts.length ? timeParts.join(' · ') : '';

    if (status === 'opened') {
        const base =
            'They opened the email (images loaded) or clicked the report link';
        return timeLine ? `${base} · ${timeLine}` : base;
    }
    if (status === 'sent') {
        const base =
            'Waiting — turns Opened when they display images or click “View full audit report”. Opening the PDF attachment alone is not tracked.';
        return timeLine ? `${base} · ${timeLine}` : base;
    }
    return timeLine;
}

/** Short lines for UI under a Sent/Opened badge. */
export function emailShareStatusTimeLines(times?: EmailShareTimes | null): string[] {
    const lines: string[] = [];
    const sentFmt = formatEmailShareDateTime(times?.sentAt);
    const openedFmt = formatEmailShareDateTime(times?.openedAt);
    if (sentFmt) lines.push(`Sent ${sentFmt}`);
    if (openedFmt) lines.push(`Opened ${openedFmt}`);
    return lines;
}
