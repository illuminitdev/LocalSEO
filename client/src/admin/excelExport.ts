import * as XLSX from 'xlsx';
import * as XLSXStyle from 'xlsx-js-style';
import type { ExcelExportLead } from './adminApi';

const clean = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The 3 filled columns, and how to spot the same column in the uploaded sheet (same idea as the upload parser). */
const FILLED: { header: string; value: (l: ExcelExportLead) => string; matches: (k: string) => boolean }[] = [
    {
        header: 'GBP Observation',
        value: (l) => l.gbpObservation,
        matches: (k) => k === 'gbp' || k.includes('observationgbp') || k.includes('gbpobservation')
    },
    {
        header: 'AI Visibility',
        value: (l) => l.aiVisibility,
        matches: (k) => k.includes('aivisibility') || k.includes('aiobservation') || k.includes('observationaiv')
    },
    {
        header: 'Priority',
        value: (l) => l.priority,
        matches: (k) => k.includes('opportunity') || k.includes('oppurtunity') || k === 'priority'
    }
];

/** Uploaded before rows were kept: export the stored lead fields instead. */
const FALLBACK: [string, (l: ExcelExportLead) => string][] = [
    ['Business name', (l) => l.name],
    ['Phone', (l) => l.phone],
    ['Email', (l) => l.email],
    ['Website URL', (l) => l.website],
    ['Town/postcode', (l) => l.address],
    ['Business', (l) => l.industry],
    ['GBP URL', (l) => l.gbpUrl]
];

function sheetRows(leads: ExcelExportLead[]): string[][] {
    const headers: string[] = [];
    for (const l of leads) {
        const cols = l.raw ? l.raw.map(([h]) => h) : FALLBACK.map(([h]) => h);
        for (const h of cols) if (!headers.includes(h)) headers.push(h);
    }
    // Write each filled value into the matching uploaded column, or append the column at the end.
    const filledAt = FILLED.map((f) => {
        const i = headers.findIndex((h) => f.matches(clean(h)));
        if (i >= 0) return i;
        headers.push(f.header);
        return headers.length - 1;
    });

    const body = leads.map((l) => {
        const cells: Record<string, string> = l.raw
            ? Object.fromEntries(l.raw)
            : Object.fromEntries(FALLBACK.map(([h, get]) => [h, get(l)]));
        const row = headers.map((h) => cells[h] ?? '');
        FILLED.forEach((f, n) => {
            const v = f.value(l);
            if (v) row[filledAt[n]] = v;
        });
        return row;
    });
    return [headers, ...body];
}

/** Download the leads shown in the admin Leads list as one "Leads" sheet. */
export function downloadLeadsExport(rows: Record<string, string>[], fileName: string) {
    const headers = rows.length ? Object.keys(rows[0]) : [];
    const sheet = XLSXStyle.utils.aoa_to_sheet([headers, ...rows.map((r) => headers.map((h) => r[h] ?? ''))]);
    sheet['!cols'] = headers.map((h) => ({
        wch: Math.min(50, Math.max(h.length, ...rows.map((r) => (r[h] ?? '').length)) + 2)
    }));
    // Bold header row.
    headers.forEach((_, c) => {
        const cell = sheet[XLSXStyle.utils.encode_cell({ r: 0, c })];
        if (cell) cell.s = { font: { bold: true } };
    });
    const wb = XLSXStyle.utils.book_new();
    XLSXStyle.utils.book_append_sheet(wb, sheet, 'Leads');
    XLSXStyle.writeFile(wb, fileName);
}

/** Download one Excel upload with its original columns plus GBP Observation, AI Visibility and Priority. */
export function downloadExcelExport(leads: ExcelExportLead[], fileName: string) {
    const wb = XLSX.utils.book_new();
    const bySheet = new Map<string, ExcelExportLead[]>();
    for (const l of leads) {
        const name = l.sheetName || 'Leads';
        bySheet.set(name, [...(bySheet.get(name) || []), l]);
    }
    const used = new Set<string>();
    for (const [name, group] of bySheet) {
        // Excel sheet names: max 31 chars, no : \ / ? * [ ], unique.
        const base = name.replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || 'Leads';
        let sheet = base;
        for (let i = 2; used.has(sheet.toLowerCase()); i++) sheet = `${base.slice(0, 28)} ${i}`;
        used.add(sheet.toLowerCase());
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetRows(group)), sheet);
    }
    const stem = fileName.replace(/\.(xlsx|xlsm|xls|csv)$/i, '').trim() || 'leads';
    XLSX.writeFile(wb, `${stem}-updated.xlsx`);
}
