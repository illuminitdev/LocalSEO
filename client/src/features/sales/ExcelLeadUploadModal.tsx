import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
    Upload,
    FileSpreadsheet,
    CheckCircle2,
    AlertCircle,
    X,
    Loader2,
    Layers,
    Sparkles
} from 'lucide-react';

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
    notes: string;
    conclusion?: string;
    sheetName: string;
}

interface ExcelLeadUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImportSuccess: (count: number) => void;
    importEndpoint?: (leads: ParsedLeadRow[]) => Promise<{ count: number; created: number; skipped: number }>;
}

export default function ExcelLeadUploadModal({
    isOpen,
    onClose,
    onImportSuccess,
    importEndpoint
}: ExcelLeadUploadModalProps) {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [fileName, setFileName] = useState('');
    const [sheetNames, setSheetNames] = useState<string[]>([]);
    const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
    const [parsedRowsBySheet, setParsedRowsBySheet] = useState<Record<string, ParsedLeadRow[]>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [importResult, setImportResult] = useState<{ created: number; skipped: number } | null>(null);

    if (!isOpen) return null;

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setError('');
        setImportResult(null);
        setIsLoading(true);
        setFileName(file.name);

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });

            const validSheets = workbook.SheetNames.filter(
                (name) => !['note', 'notes', 'instructions', 'readme'].includes(name.trim().toLowerCase())
            );

            const allSheets = workbook.SheetNames;
            const initialSelected = validSheets.length > 0 ? validSheets : allSheets;

            const sheetDataMap: Record<string, ParsedLeadRow[]> = {};

            for (const sheet of allSheets) {
                const ws = workbook.Sheets[sheet];
                const rawJson: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

                const rows: ParsedLeadRow[] = [];

                for (const row of rawJson) {
                    const keys = Object.keys(row);

                    // Robust matcher: exact match first, then includes match
                    const findVal = (matchers: string[], excludeMatchers: string[] = []) => {
                        // 1. Exact match
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
                        // 2. Contains match
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

                    const bName = findVal(
                        ['businessname', 'companyname', 'company', 'name', 'clientname'],
                        ['businessphone', 'businessdomain', 'businesstype', 'business']
                    ) || findVal(['business'], ['businessphone', 'businessdomain', 'businesstype']);

                    const phone = findVal(['phone', 'businessphone', 'mobile', 'tel', 'contact', 'telephone', 'contactnumber']);
                    const address = findVal(['townpostcode', 'postcode', 'town', 'address', 'location', 'city', 'street']);
                    const website = findVal(['websiteurl', 'website', 'url', 'domain', 'web', 'site', 'businessdomain']);
                    const rowIndustry = findVal(['business', 'industry', 'category', 'sector', 'niche', 'vertical', 'businesstype'], ['businessname', 'companyname']);
                    const gbp = findVal(['myobservationgbp', 'gbpobservation', 'gbp', 'googlebusinessprofile', 'googlebusiness']);
                    const aiVis = findVal(['myobservationaivisibility', 'myobservationaiv', 'aivisibility', 'aiv', 'aiobservation', 'aivis', 'visibility']);
                    let conclusion = findVal([
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
                    ], [
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
                    ]);

                    // Extra scan across all keys for any conclusion/takeaways/verdict column
                    if (!conclusion) {
                        for (const k of keys) {
                            const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
                            if (cleanK.includes('concl') || cleanK.includes('takeaway') || cleanK.includes('verdict') || cleanK.includes('finding')) {
                                const v = String(row[k] || '').trim();
                                if (v) {
                                    conclusion = v;
                                    break;
                                }
                            }
                        }
                    }

                    const opp = findVal(['leadopportunity', 'opportunity', 'pitch', 'priority']);
                    const statusVal = findVal(['status', 'disposition', 'callingstatus', 'callstatus', 'leadstatus']);
                    const email = findVal(['email', 'mail', 'emailaddress', 'contactemail']);

                    // Skip empty rows
                    if (!bName && !phone && !website && !address) continue;

                    let oppLevel: 'high' | 'medium' | 'low' = 'medium';
                    const oppLower = opp.toLowerCase();
                    if (oppLower.includes('high')) oppLevel = 'high';
                    else if (oppLower.includes('low')) oppLevel = 'low';

                    let mappedStatus = 'new';
                    const sLower = statusVal.toLowerCase();
                    if (sLower.includes('converted') || sLower.includes('won') || sLower.includes('closed')) mappedStatus = 'converted';
                    else if (sLower.includes('not interested') || sLower.includes('lost') || sLower.includes('rejected')) mappedStatus = 'not_interested';
                    else if (sLower.includes('interested')) mappedStatus = 'interested';
                    else if (sLower.includes('follow') || sLower.includes('callback') || sLower.includes('call back')) mappedStatus = 'follow_up';
                    else if (sLower.includes('contacted') || sLower.includes('called') || sLower.includes('attempted')) mappedStatus = 'contacted';
                    else if (sLower.includes('scheduled') || sLower.includes('meeting') || sLower.includes('audit')) mappedStatus = 'audit_scheduled';

                    rows.push({
                        businessName: bName || 'Lead',
                        phone,
                        email,
                        address,
                        website,
                        industry: rowIndustry || sheet.trim(),
                        gbpObservation: gbp,
                        aiVisibilityObservation: aiVis,
                        leadOpportunity: opp,
                        opportunityLevel: oppLevel,
                        status: mappedStatus,
                        notes: conclusion,
                        conclusion: conclusion,
                        sheetName: sheet.trim()
                    });
                }

                sheetDataMap[sheet] = rows;
            }

            setSheetNames(allSheets);
            setSelectedSheets(initialSelected);
            setParsedRowsBySheet(sheetDataMap);
        } catch (err: any) {
            console.error('Failed to parse Excel file:', err);
            setError(err.message || 'Failed to read spreadsheet file. Please check file format.');
        } finally {
            setIsLoading(false);
        }
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

    const handleImportSubmit = async () => {
        if (!activeRowsToImport.length) {
            setError('Please select at least one sheet containing leads to import.');
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            if (importEndpoint) {
                const res = await importEndpoint(activeRowsToImport);
                setImportResult({ created: res.created, skipped: res.skipped });
                onImportSuccess(res.created);
            } else {
                // Default fallback: direct fetch to /api/sales/leads/bulk-import
                const res = await fetch('/api/sales/leads/bulk-import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ leads: activeRowsToImport })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to import leads');
                setImportResult({ created: data.created, skipped: data.skipped });
                onImportSuccess(data.created);
            }
        } catch (err: any) {
            console.error('Import error:', err);
            setError(err.message || 'Failed to complete import.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetModal = () => {
        setFileName('');
        setSheetNames([]);
        setSelectedSheets([]);
        setParsedRowsBySheet({});
        setError('');
        setImportResult(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
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
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
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
                                Successfully imported <span className="font-bold text-emerald-600">{importResult.created} new leads</span> into your CRM.
                                {importResult.skipped > 0 && (
                                    <span className="text-slate-500"> ({importResult.skipped} duplicate or empty entries skipped)</span>
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
                                    onClick={onClose}
                                    className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-colors"
                                >
                                    View in CRM
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Upload Dropzone */}
                            {!sheetNames.length ? (
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="border-2 border-dashed border-slate-300 hover:border-emerald-500 bg-slate-50/50 hover:bg-emerald-50/20 rounded-2xl p-10 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 group"
                                >
                                    <input
                                        ref={fileInputRef}
                                        type="file"
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
                                            Click to select or drag & drop Spreadsheet workbook
                                        </div>
                                        <div className="text-xs text-slate-500 mt-1">
                                            Supports .xlsx, .xls, .ods, and .csv with multi-sheet tabs or domain/industry columns
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    {/* File Header Bar */}
                                    <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-sm">
                                        <div className="flex items-center gap-2.5 font-medium text-slate-800">
                                            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                                            <span>{fileName}</span>
                                            <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold">
                                                {activeRowsToImport.length} Leads found
                                            </span>
                                        </div>
                                        <button
                                            onClick={resetModal}
                                            className="text-xs text-slate-500 hover:text-red-600 underline font-medium"
                                        >
                                            Change file
                                        </button>
                                    </div>

                                    {/* Sheet Selection Tabs */}
                                    {sheetNames.length > 1 && (
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                                                    <Layers className="w-3.5 h-3.5 text-indigo-500" />
                                                    Select Industry Tabs to Import ({selectedSheets.length}/{sheetNames.length})
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

                                    {/* Preview Table */}
                                    <div className="space-y-2">
                                        <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
                                            Previewing First {Math.min(5, activeRowsToImport.length)} of {activeRowsToImport.length} Leads
                                        </div>
                                        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                                            <div className="overflow-x-auto max-h-56">
                                                <table className="w-full text-left text-xs border-collapse">
                                                    <thead>
                                                        <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                                                            <th className="p-2.5">Industry</th>
                                                            <th className="p-2.5">Business Name</th>
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
                                                                <td className="p-2.5 text-slate-600 truncate max-w-[180px]" title={row.notes}>
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

                {/* Footer */}
                {!importResult && (
                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                        <div className="text-xs text-slate-500">
                            {activeRowsToImport.length > 0 && (
                                <span>
                                    Ready to import <strong className="text-slate-800">{activeRowsToImport.length}</strong> leads across{' '}
                                    <strong className="text-slate-800">{selectedSheets.length}</strong> industry categories.
                                </span>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isSubmitting}
                                className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 rounded-xl transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            {activeRowsToImport.length > 0 && (
                                <button
                                    type="button"
                                    onClick={handleImportSubmit}
                                    disabled={isSubmitting || !activeRowsToImport.length}
                                    className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl shadow-sm transition-all flex items-center gap-2"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span>Importing...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-4 h-4" />
                                            <span>Import {activeRowsToImport.length} Leads</span>
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
