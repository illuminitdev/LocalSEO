import React, { useState, useRef, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
    Upload,
    FileSpreadsheet,
    CheckCircle2,
    AlertCircle,
    X,
    Loader2,
    Layers,
    AlertTriangle,
    Download
} from 'lucide-react';
import { normalizeBusinessCategory } from '../admin/AdminGrowthAuditLeads';

export interface ParsedLeadRow {
    businessName: string;
    phone: string;
    email: string;
    address: string;
    website: string;
    industry: string;
    gbpObservation: string;
    aiVisibilityObservation: string;
    leadOpportunity: string;
    opportunityLevel: 'high' | 'medium' | 'low';
    status: string;
    spreadsheetStatus?: string;
    spreadsheetStatus1?: string;
    spreadsheetStatus2?: string;
    spreadsheetStatus3?: string;
    notes: string;
    conclusion?: string;
    sheetName: string;
}

interface ExcelLeadUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImportSuccess: (count: number) => void;
    importEndpoint?: (
        leads: ParsedLeadRow[],
        meta?: { fileName: string }
    ) => Promise<{ count: number; created: number; skipped: number }>;
}

const SKIP_SHEET_NAMES = new Set(['note', 'notes', 'instructions', 'readme']);

/** Column headers matching Businesses_For_Tele_Callers_Standardized.xlsx */
export const LEADS_EXCEL_TEMPLATE_HEADERS = [
    'Business',
    'Phone',
    'Business name',
    'Town/postcode',
    'Website URL',
    'My Observation GBP',
    'My Observation AI Visibility',
    'My Conclusion',
    'Lead Oppurtunity',
    'Status 1',
    'Status 2',
    'Status 3'
] as const;

/** Download a blank leads workbook with headers + two example rows. */
export function downloadLeadsExcelTemplate(filename = 'zappsites-leads-import-template.xlsx') {
    const examples = [
        {
            Business: 'Pestcontrol',
            Phone: '01772 885100',
            'Business name': 'LES Pest Management',
            'Town/postcode': 'Unit 6A, Bannister Hall Works, Higher Walton, Preston PR5 4DZ',
            'Website URL': 'https://lespestmgt.com/',
            'My Observation GBP':
                '1. Basic Information : Correct\n2. Categories : Correct\n3. Services & Description : Correct\n4. Reviews & Engagement : Present\n5. Photos & Profile Completeness : Almost done but missing regular postings',
            'My Observation AI Visibility':
                '1. Who provides pest control services in South Ribble? Ans : Not Listed\n2. Who provides pest control services in Preston? Ans : Not Listed',
            'My Conclusion':
                'GBP : Postings on GBP will also increase the enquiries. Website : We can get more enquiries if we optimise for local AI SEO and add a booking system.',
            'Lead Oppurtunity': 'Medium but we can pitch for Booking System',
            'Status 1': '10/09 voicemail',
            'Status 2': '11/09 voicemail',
            'Status 3': 'Follow up next week'
        },
        {
            Business: 'Landscaping',
            Phone: '07830 317170',
            'Business name': 'JDM Gardens',
            'Town/postcode': '26 Whitehaven Rd, Bramhall, Stockport SK7 1EL, United Kingdom',
            'Website URL': 'https://www.jdmgardens.com/',
            'My Observation GBP':
                '1. Basic Information : Missing "Garden Design & Landscaping" in Business Name\n2. Categories : Correct\n3. Services & Description : Correct\n4. Reviews & Engagement : No replies for reviews\n5. Photos & Profile Completeness : Done',
            'My Observation AI Visibility':
                '1. What are the best gardening and landscaping companies near Bramhall, Stockport? Ans: 2nd position\n2. Who would you recommend for garden landscaping in Bramhall? Ans: 2nd position',
            'My Conclusion':
                'Strong local ranking already — pitch review replies, GBP name fix, and booking system.',
            'Lead Oppurtunity': 'High and also we can pitch for Booking System',
            'Status 1': '09/09 Spoke to receptionist — send info to pass on',
            'Status 2': 'Interested — waiting for decision maker',
            'Status 3': 'Send proposal'
        }
    ];

    const ws = XLSX.utils.json_to_sheet(examples, {
        header: [...LEADS_EXCEL_TEMPLATE_HEADERS]
    });
    ws['!cols'] = LEADS_EXCEL_TEMPLATE_HEADERS.map((h) => ({
        wch: Math.min(40, Math.max(16, h.length + 4))
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads');
    XLSX.writeFile(wb, filename);
}

function normalizeName(value: string): string {
    return String(value || '').trim().toLowerCase();
}

function normalizeEmail(value: string): string {
    return String(value || '').trim().toLowerCase();
}

function normalizePhone(value: string): string {
    return String(value || '').replace(/[^0-9]/g, '');
}

function normalizeWebsite(value: string): string {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/+$/, '');
}

/** Keep first row; skip later rows that share name, email, phone, or website. */
export function dedupeLeadRows(rows: ParsedLeadRow[]): {
    unique: ParsedLeadRow[];
    duplicateCount: number;
    examples: string[];
} {
    const seenName = new Set<string>();
    const seenEmail = new Set<string>();
    const seenPhone = new Set<string>();
    const seenWebsite = new Set<string>();
    const unique: ParsedLeadRow[] = [];
    const examples: string[] = [];
    let duplicateCount = 0;

    for (const row of rows) {
        const name = normalizeName(row.businessName);
        const email = normalizeEmail(row.email);
        const phone = normalizePhone(row.phone);
        const website = normalizeWebsite(row.website);

        const nameKey = name && name !== 'lead' ? name : '';
        const phoneKey = phone.length >= 7 ? phone : '';
        const emailKey = email || '';
        const websiteKey = website || '';

        const isDup =
            (nameKey && seenName.has(nameKey)) ||
            (emailKey && seenEmail.has(emailKey)) ||
            (phoneKey && seenPhone.has(phoneKey)) ||
            (websiteKey && seenWebsite.has(websiteKey));

        if (isDup) {
            duplicateCount++;
            if (examples.length < 3) {
                examples.push(row.businessName || emailKey || phoneKey || websiteKey || 'Unknown');
            }
            continue;
        }

        if (nameKey) seenName.add(nameKey);
        if (emailKey) seenEmail.add(emailKey);
        if (phoneKey) seenPhone.add(phoneKey);
        if (websiteKey) seenWebsite.add(websiteKey);
        unique.push(row);
    }

    return { unique, duplicateCount, examples };
}

function parseWorkbookSheet(
    workbook: XLSX.WorkBook,
    sheet: string,
    displaySheetName: string
): ParsedLeadRow[] {
    const ws = workbook.Sheets[sheet];
    const rawJson: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const rows: ParsedLeadRow[] = [];

    for (const row of rawJson) {
        const keys = Object.keys(row);

        const findVal = (matchers: string[], excludeMatchers: string[] = []) => {
            for (const m of matchers) {
                const cleanM = m.toLowerCase().replace(/[^a-z0-9]/g, '');
                for (const k of keys) {
                    const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (excludeMatchers.some((ex) => cleanK === ex.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
                        continue;
                    }
                    if (cleanK === cleanM) {
                        const val = String(row[k] || '').trim();
                        if (val) return val;
                    }
                }
            }
            for (const m of matchers) {
                const cleanM = m.toLowerCase().replace(/[^a-z0-9]/g, '');
                for (const k of keys) {
                    const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (excludeMatchers.some((ex) => cleanK === ex.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
                        continue;
                    }
                    if (cleanK.includes(cleanM) || cleanM.includes(cleanK)) {
                        const val = String(row[k] || '').trim();
                        if (val) return val;
                    }
                }
            }
            return '';
        };

        const bName =
            findVal(
                ['businessname', 'companyname', 'company', 'name', 'clientname'],
                ['businessphone', 'businessdomain', 'businesstype', 'business']
            ) || findVal(['business'], ['businessphone', 'businessdomain', 'businesstype']);

        const phone = findVal(['phone', 'businessphone', 'mobile', 'tel', 'contact', 'telephone', 'contactnumber']);
        const address = findVal(['townpostcode', 'postcode', 'town', 'address', 'location', 'city', 'street']);
        const website = findVal(['websiteurl', 'website', 'url', 'domain', 'web', 'site', 'businessdomain']);
        const rowIndustry = findVal(
            ['business', 'industry', 'category', 'sector', 'niche', 'vertical', 'businesstype'],
            ['businessname', 'companyname']
        );
        const gbp = findVal(['myobservationgbp', 'gbpobservation', 'gbp', 'googlebusinessprofile', 'googlebusiness']);
        const aiVis = findVal([
            'myobservationaivisibility',
            'myobservationaiv',
            'aivisibility',
            'aiv',
            'aiobservation',
            'aivis',
            'visibility'
        ]);
        let conclusion = findVal(
            [
                'concl',
                'myconcl',
                'myconclusion',
                'myconclusions',
                'myconcluision',
                'myconcluisions',
                'myconclution',
                'myconclutions',
                'conclusion',
                'conclusions',
                'concluision',
                'concluisions',
                'conclution',
                'conclutions',
                'observationconclusion',
                'myobservationconclusion',
                'auditconclusion',
                'auditsummary',
                'conclusionnotes',
                'summarynotes',
                'takeaway',
                'takeaways',
                'keytakeaways',
                'keytakeaway',
                'verdict',
                'remarks',
                'findings',
                'auditnotes',
                'summary',
                'notes',
                'note'
            ],
            [
                'myobservationgbp',
                'myobservationaivisibility',
                'gbp',
                'aivisibility',
                'aiv',
                'gbpobservation',
                'aivisibilityobservation',
                'leadopportunity',
                'opportunity',
                'businessname',
                'companyname',
                'business',
                'company',
                'phone',
                'email',
                'website',
                'address',
                'townpostcode',
                'postcode',
                'status',
                'callingstatus',
                'callstatus'
            ]
        );

        if (!conclusion) {
            for (const k of keys) {
                const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (
                    cleanK.includes('concl') ||
                    cleanK.includes('takeaway') ||
                    cleanK.includes('verdict') ||
                    cleanK.includes('finding')
                ) {
                    const v = String(row[k] || '').trim();
                    if (v) {
                        conclusion = v;
                        break;
                    }
                }
            }
        }

        const opp = findVal(['leadopportunity', 'leadoppurtunity', 'opportunity', 'oppurtunity', 'pitch', 'priority']);
        const statusVal1 = findVal(
            [
                'status1',
                'initialstatus',
                'leadstatus',
                'leadstage',
                'leadstate',
                'currentstatus',
                'actionstatus',
                'stage',
                'state',
                'status'
            ],
            [
                'status2',
                'status3',
                'callingstatus',
                'callstatus',
                'disposition',
                'callingdisposition',
                'lateststatus',
                'callresult',
                'telecallerstatus',
                'outcomestatus',
                'followupstatus',
                'followup'
            ]
        );
        const statusVal2 = findVal(
            [
                'status2',
                'callingstatus',
                'callstatus',
                'disposition',
                'callingdisposition',
                'lateststatus',
                'callresult',
                'telecallerstatus',
                'outcomestatus'
            ],
            ['status1', 'status3', 'initialstatus', 'leadstatus', 'leadstage']
        );
        const statusVal3 = findVal(
            ['status3', 'followupstatus', 'followup', 'nextstep', 'nextaction'],
            [
                'status1',
                'status2',
                'callingstatus',
                'callstatus',
                'disposition',
                'initialstatus',
                'leadstatus'
            ]
        );
        const email = findVal(['email', 'mail', 'emailaddress', 'contactemail']);

        if (!bName && !phone && !website && !address) continue;

        let oppLevel: 'high' | 'medium' | 'low' = 'medium';
        const oppLower = opp.toLowerCase();
        if (oppLower.includes('high')) oppLevel = 'high';
        else if (oppLower.includes('low')) oppLevel = 'low';

        const mapStatus = (raw: string): string => {
            const sLower = raw.toLowerCase().trim().replace(/[-_]/g, ' ');
            if (!sLower) return 'new';
            if (
                sLower.includes('convert') ||
                sLower.includes('won') ||
                sLower.includes('closed') ||
                sLower.includes('customer') ||
                sLower.includes('paid') ||
                sLower.includes('deal won')
            )
                return 'converted';
            if (
                sLower.includes('not interested') ||
                sLower.includes('lost') ||
                sLower.includes('rejected') ||
                sLower.includes('declined') ||
                sLower.includes('dnc') ||
                sLower.includes('cold') ||
                sLower.includes('wrong number') ||
                sLower.includes('invalid')
            )
                return 'not_interested';
            if (
                sLower.includes('callback') ||
                sLower.includes('call back') ||
                sLower.includes('follow') ||
                sLower.includes('call later')
            )
                return 'callback';
            if (
                sLower.includes('interested') ||
                sLower.includes('warm') ||
                sLower.includes('hot') ||
                sLower.includes('qualified') ||
                sLower.includes('in progress') ||
                sLower.includes('audit scheduled')
            )
                return 'interested';
            if (
                sLower.includes('contacted') ||
                sLower.includes('called') ||
                sLower.includes('spoke') ||
                sLower.includes('reached') ||
                sLower.includes('connected') ||
                sLower.includes('attempted') ||
                sLower.includes('voicemail') ||
                sLower.includes('ringing') ||
                sLower.includes('no answer') ||
                sLower.includes('busy')
            )
                return 'contacted';
            return 'new';
        };

        const mappedStatus = mapStatus(statusVal1 || statusVal2 || statusVal3);
        const spreadsheetStatus1 = (statusVal1 || '').trim();
        const spreadsheetStatus2 = (statusVal2 || '').trim();
        const spreadsheetStatus3 = (statusVal3 || '').trim();
        const statusParts = [spreadsheetStatus1, spreadsheetStatus2, spreadsheetStatus3].filter(
            (s, i, arr) => s && arr.findIndex((x) => x.toLowerCase() === s.toLowerCase()) === i
        );
        const spreadsheetStatus = statusParts.join(' · ');

        const industryFallback = sheet.includes(' › ') ? sheet.split(' › ').slice(-1)[0].trim() : sheet.trim();
        const cleanRowIndustry = /^sheet\s*\d+$/i.test(rowIndustry) ? '' : rowIndustry;
        const cleanFallback = /^sheet\s*\d+$/i.test(industryFallback) ? '' : industryFallback;
        const rawInd = cleanRowIndustry || cleanFallback;
        const finalIndustry = normalizeBusinessCategory(rawInd) || rawInd;

        rows.push({
            businessName: bName || 'Lead',
            phone,
            email,
            address,
            website,
            industry: finalIndustry,
            gbpObservation: gbp,
            aiVisibilityObservation: aiVis,
            leadOpportunity: opp,
            opportunityLevel: oppLevel,
            status: mappedStatus,
            spreadsheetStatus,
            spreadsheetStatus1,
            spreadsheetStatus2,
            spreadsheetStatus3,
            notes: conclusion,
            conclusion,
            sheetName: displaySheetName
        });
    }

    return rows;
}

export default function ExcelLeadUploadModal({
    isOpen,
    onClose,
    onImportSuccess,
    importEndpoint
}: ExcelLeadUploadModalProps) {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [fileName, setFileName] = useState('');
    const [fileCount, setFileCount] = useState(0);
    const [sheetNames, setSheetNames] = useState<string[]>([]);
    const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
    const [parsedRowsBySheet, setParsedRowsBySheet] = useState<Record<string, ParsedLeadRow[]>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [importResult, setImportResult] = useState<{ created: number; skipped: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    const resetModal = () => {
        setFileName('');
        setFileCount(0);
        setSheetNames([]);
        setSelectedSheets([]);
        setParsedRowsBySheet({});
        setError('');
        setImportResult(null);
        setIsLoading(false);
        setIsSubmitting(false);
        setIsDragging(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    useEffect(() => {
        if (!isOpen) {
            resetModal();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const handleClose = () => {
        resetModal();
        onClose();
    };

    const processFiles = async (files: File[]) => {
        if (!files.length) return;

        setError('');
        setImportResult(null);
        setIsLoading(true);

        const names = files.map((f) => f.name);
        setFileName(names.join(', '));
        setFileCount(files.length);

        try {
            const sheetDataMap: Record<string, ParsedLeadRow[]> = {};
            const allSheetKeys: string[] = [];
            const initialSelected: string[] = [];
            const multiFile = files.length > 1;

            for (const file of files) {
                const data = await file.arrayBuffer();
                const workbook = XLSX.read(data, { type: 'array' });

                const validSheets = workbook.SheetNames.filter(
                    (name) => !SKIP_SHEET_NAMES.has(name.trim().toLowerCase())
                );
                const sheetsInFile = workbook.SheetNames;
                const preferred = validSheets.length > 0 ? validSheets : sheetsInFile;

                for (const sheet of sheetsInFile) {
                    const key = multiFile ? `${file.name} › ${sheet}` : sheet;
                    allSheetKeys.push(key);
                    sheetDataMap[key] = parseWorkbookSheet(workbook, sheet, sheet.trim());
                    if (preferred.includes(sheet)) {
                        initialSelected.push(key);
                    }
                }
            }

            setSheetNames(allSheetKeys);
            setSelectedSheets(initialSelected.length > 0 ? initialSelected : allSheetKeys);
            setParsedRowsBySheet(sheetDataMap);
        } catch (err: any) {
            console.error('Failed to parse Excel file:', err);
            setError(err.message || 'Failed to read spreadsheet file. Please check file format.');
            setFileName('');
            setFileCount(0);
        } finally {
            setIsLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        await processFiles(files);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files || []).filter((f) => {
            const n = f.name.toLowerCase();
            return n.endsWith('.xlsx') || n.endsWith('.xls') || n.endsWith('.csv') || n.endsWith('.ods');
        });
        if (!files.length) {
            setError('Please drop .xlsx, .xls, .ods, or .csv files.');
            return;
        }
        await processFiles(files);
    };

    const toggleSheetSelection = (sheet: string) => {
        setSelectedSheets((prev) =>
            prev.includes(sheet) ? prev.filter((s) => s !== sheet) : [...prev, sheet]
        );
    };

    const selectAllSheets = () => {
        setSelectedSheets([...sheetNames]);
    };

    const deselectAllSheets = () => {
        setSelectedSheets([]);
    };

    const activeRowsToImport = selectedSheets.flatMap((sheet) => parsedRowsBySheet[sheet] || []);

    const dedupeInfo = useMemo(() => dedupeLeadRows(activeRowsToImport), [activeRowsToImport]);

    const handleImportSubmit = async () => {
        if (!activeRowsToImport.length) {
            setError('Please select at least one sheet containing leads to import.');
            return;
        }

        const rowsToSend = dedupeInfo.unique;
        if (!rowsToSend.length) {
            setError('All selected rows are duplicates. Nothing to import.');
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            if (importEndpoint) {
                const res = await importEndpoint(rowsToSend, { fileName });
                setImportResult({
                    created: res.created,
                    skipped: res.skipped + dedupeInfo.duplicateCount
                });
                onImportSuccess(res.created);
            } else {
                const res = await fetch('/api/sales/leads/bulk-import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ leads: rowsToSend, fileName })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to import leads');
                setImportResult({
                    created: data.created,
                    skipped: (data.skipped || 0) + dedupeInfo.duplicateCount
                });
                onImportSuccess(data.created);
            }
        } catch (err: any) {
            console.error('Import error:', err);
            setError(err.message || 'Failed to complete import.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center border border-emerald-500/20">
                            <FileSpreadsheet className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Upload Leads Spreadsheet</h2>
                            <p className="text-xs text-slate-500">
                                Import Excel (.xlsx, .xls), OpenDocument (.ods), or CSV with multi-sheet tabs
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    {error && (
                        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
                            <div>{error}</div>
                        </div>
                    )}

                    {importResult ? (
                        <div className="text-center py-10 space-y-4">
                            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                                <CheckCircle2 className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900">Import Successful!</h3>
                            <p className="text-sm text-slate-600 max-w-md mx-auto">
                                Successfully imported{' '}
                                <span className="font-bold text-emerald-600">{importResult.created} new leads</span>{' '}
                                into your CRM.
                                {importResult.skipped > 0 && (
                                    <span className="text-slate-500">
                                        {' '}
                                        ({importResult.skipped} duplicate or empty entries skipped)
                                    </span>
                                )}
                            </p>
                            <div className="pt-4 flex justify-center gap-3">
                                <button
                                    onClick={resetModal}
                                    className="px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                                >
                                    Upload Another File
                                </button>
                                <button
                                    onClick={handleClose}
                                    className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-colors"
                                >
                                    View in CRM
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {!sheetNames.length ? (
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        setIsDragging(true);
                                    }}
                                    onDragLeave={(e) => {
                                        e.preventDefault();
                                        setIsDragging(false);
                                    }}
                                    onDrop={handleDrop}
                                    className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 group ${
                                        isDragging
                                            ? 'border-emerald-500 bg-emerald-50/40'
                                            : 'border-slate-300 hover:border-emerald-500 bg-slate-50/50 hover:bg-emerald-50/20'
                                    }`}
                                >
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        multiple
                                        accept=".xlsx,.xls,.csv,.ods,application/vnd.oasis.opendocument.spreadsheet"
                                        onChange={handleFileChange}
                                        className="hidden"
                                    />
                                    <div className="w-14 h-14 rounded-2xl bg-white shadow-sm border border-slate-200 flex items-center justify-center text-slate-400 group-hover:text-emerald-600 group-hover:border-emerald-200 transition-colors">
                                        {isLoading ? (
                                            <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                                        ) : (
                                            <Upload className="w-6 h-6" />
                                        )}
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-slate-800 group-hover:text-emerald-700">
                                            Click to select or drag & drop spreadsheet files
                                        </div>
                                        <div className="text-xs text-slate-500 mt-1">
                                            Select one or more .xlsx, .xls, .ods, or .csv files with multi-sheet tabs
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            downloadLeadsExcelTemplate();
                                        }}
                                        className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-sky-200 bg-white text-sky-800 hover:bg-sky-50 transition-colors"
                                    >
                                        <Download className="w-3.5 h-3.5" />
                                        Download template (2 examples)
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-sm gap-3">
                                        <div className="flex items-center gap-2.5 font-medium text-slate-800 min-w-0">
                                            <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                                            <div className="min-w-0">
                                                <div className="truncate" title={fileName}>
                                                    {fileCount > 1 ? `${fileCount} files selected` : fileName}
                                                </div>
                                                {fileCount > 1 && (
                                                    <div className="text-[11px] text-slate-500 truncate font-normal" title={fileName}>
                                                        {fileName}
                                                    </div>
                                                )}
                                            </div>
                                            <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold shrink-0">
                                                {activeRowsToImport.length} Leads found
                                            </span>
                                        </div>
                                        <button
                                            onClick={resetModal}
                                            className="text-xs text-slate-500 hover:text-red-600 underline font-medium shrink-0"
                                        >
                                            Change files
                                        </button>
                                    </div>

                                    {dedupeInfo.duplicateCount > 0 && (
                                        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-sm flex items-start gap-3">
                                            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
                                            <div className="space-y-1">
                                                <p className="font-semibold">
                                                    {dedupeInfo.duplicateCount} duplicate{' '}
                                                    {dedupeInfo.duplicateCount === 1 ? 'row' : 'rows'} found
                                                </p>
                                                <p className="text-xs text-amber-900/80 leading-relaxed">
                                                    Matching business name, email, phone, or website within this upload.
                                                    Only the first of each will be imported
                                                    {dedupeInfo.unique.length > 0
                                                        ? ` (${dedupeInfo.unique.length} unique leads).`
                                                        : '.'}
                                                    {dedupeInfo.examples.length > 0 && (
                                                        <> Examples: {dedupeInfo.examples.join(', ')}</>
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {sheetNames.length > 1 && (
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                                                    <Layers className="w-3.5 h-3.5 text-indigo-500" />
                                                    Select Industry Tabs to Import ({selectedSheets.length}/
                                                    {sheetNames.length})
                                                </label>
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={selectAllSheets}
                                                        className="text-xs text-emerald-600 hover:underline font-semibold"
                                                    >
                                                        Select All
                                                    </button>
                                                    <span className="text-slate-300">|</span>
                                                    <button
                                                        type="button"
                                                        onClick={deselectAllSheets}
                                                        className="text-xs text-slate-500 hover:underline"
                                                    >
                                                        Deselect All
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap gap-2 pt-1">
                                                {sheetNames.map((sheet) => {
                                                    const isSelected = selectedSheets.includes(sheet);
                                                    const rowCount = parsedRowsBySheet[sheet]?.length || 0;
                                                    return (
                                                        <button
                                                            key={sheet}
                                                            type="button"
                                                            onClick={() => toggleSheetSelection(sheet)}
                                                            className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-2 transition-all ${
                                                                isSelected
                                                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-xs'
                                                                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                                            }`}
                                                        >
                                                            <div
                                                                className={`w-2 h-2 rounded-full ${
                                                                    isSelected ? 'bg-emerald-500' : 'bg-slate-300'
                                                                }`}
                                                            />
                                                            <span className="font-semibold">{sheet}</span>
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                                                {rowCount}
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
                                            Previewing First {Math.min(5, activeRowsToImport.length)} of{' '}
                                            {activeRowsToImport.length} Leads
                                        </div>
                                        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                                            <div className="overflow-x-auto max-h-56">
                                                <table className="w-full text-left text-xs border-collapse">
                                                    <thead>
                                                        <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                                                            <th className="p-2.5">Industry</th>
                                                            <th className="p-2.5">Business Name</th>
                                                            <th className="p-2.5">Status</th>
                                                            <th className="p-2.5">Phone</th>
                                                            <th className="p-2.5">Town / Postcode</th>
                                                            <th className="p-2.5">Website</th>
                                                            <th className="p-2.5">Opportunity</th>
                                                            <th className="p-2.5">Conclusion</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {activeRowsToImport.slice(0, 5).map((row, idx) => (
                                                            <tr key={idx} className="hover:bg-slate-50">
                                                                <td className="p-2.5 font-medium text-slate-600">
                                                                    <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-[11px]">
                                                                        {row.industry}
                                                                    </span>
                                                                </td>
                                                                <td className="p-2.5 font-semibold text-slate-900">
                                                                    {row.businessName}
                                                                </td>
                                                                <td className="p-2.5">
                                                                    <span
                                                                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border tracking-wider ${
                                                                            row.spreadsheetStatus
                                                                                ? 'bg-indigo-50 text-indigo-800 border-indigo-200 normal-case'
                                                                                : row.status === 'converted'
                                                                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300 uppercase'
                                                                                  : row.status === 'contacted'
                                                                                    ? 'bg-blue-100 text-blue-800 border-blue-200 uppercase'
                                                                                    : row.status === 'callback'
                                                                                      ? 'bg-amber-100 text-amber-800 border-amber-200 uppercase'
                                                                                      : row.status === 'interested'
                                                                                        ? 'bg-purple-100 text-purple-800 border-purple-200 uppercase'
                                                                                        : row.status === 'not_interested'
                                                                                          ? 'bg-rose-100 text-rose-800 border-rose-200 uppercase'
                                                                                          : 'bg-slate-100 text-slate-700 border-slate-200 uppercase'
                                                                        }`}
                                                                    >
                                                                        {row.spreadsheetStatus ||
                                                                            row.status.replace(/_/g, ' ')}
                                                                    </span>
                                                                </td>
                                                                <td className="p-2.5 text-slate-600 font-mono">
                                                                    {row.phone || '—'}
                                                                </td>
                                                                <td className="p-2.5 text-slate-600 truncate max-w-[150px]">
                                                                    {row.address || '—'}
                                                                </td>
                                                                <td className="p-2.5 text-slate-600 truncate max-w-[150px]">
                                                                    {row.website ? (
                                                                        <span className="text-indigo-600 underline">
                                                                            {row.website}
                                                                        </span>
                                                                    ) : (
                                                                        '—'
                                                                    )}
                                                                </td>
                                                                <td className="p-2.5">
                                                                    <span
                                                                        className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                                                            row.opportunityLevel === 'high'
                                                                                ? 'bg-emerald-100 text-emerald-800'
                                                                                : row.opportunityLevel === 'low'
                                                                                  ? 'bg-slate-100 text-slate-600'
                                                                                  : 'bg-amber-100 text-amber-800'
                                                                        }`}
                                                                    >
                                                                        {row.opportunityLevel.toUpperCase()}
                                                                    </span>
                                                                </td>
                                                                <td
                                                                    className="p-2.5 text-slate-600 truncate max-w-[180px]"
                                                                    title={row.notes}
                                                                >
                                                                    {row.notes ? (
                                                                        <span className="text-[11px] text-slate-700 font-medium">
                                                                            {row.notes}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-slate-400">—</span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {!importResult && (
                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
                        <div className="text-xs text-slate-500">
                            {activeRowsToImport.length > 0 && (
                                <span>
                                    Ready to import{' '}
                                    <strong className="text-slate-800">{dedupeInfo.unique.length}</strong>
                                    {dedupeInfo.duplicateCount > 0 && (
                                        <>
                                            {' '}
                                            unique leads
                                            <span className="text-amber-700">
                                                {' '}
                                                ({dedupeInfo.duplicateCount} duplicates skipped)
                                            </span>
                                        </>
                                    )}
                                    {dedupeInfo.duplicateCount === 0 && (
                                        <>
                                            {' '}
                                            leads across{' '}
                                            <strong className="text-slate-800">{selectedSheets.length}</strong>{' '}
                                            industry categories.
                                        </>
                                    )}
                                </span>
                            )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={handleClose}
                                disabled={isSubmitting}
                                className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 rounded-xl transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            {activeRowsToImport.length > 0 && (
                                <button
                                    type="button"
                                    onClick={handleImportSubmit}
                                    disabled={isSubmitting || !dedupeInfo.unique.length}
                                    className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl shadow-sm transition-all flex items-center gap-2"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span>Importing...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="w-4 h-4" />
                                            <span>Import {dedupeInfo.unique.length} Leads</span>
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
