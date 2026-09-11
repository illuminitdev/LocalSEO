import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    Map,
    Crosshair,
    Users,
    Activity,
    Sparkles,
    TrendingUp,
    TrendingDown,
    Radar,
    Loader2,
    X,
    FileText,
    Download,
    ListOrdered
} from 'lucide-react';
import { apiGet, apiPost, logDashboardActivity, updateDashboardStats } from '../../shared/utils';
import VisibilityFixBanner from '../../shared/VisibilityFixBanner';
import PlacesMap, { geoGridMarkers, geocodeAddress, mapsJsConfigured, type MapMarker } from '../../shared/PlacesMap';
import {
    PRIMARY_SERVICES,
    loadVisibilityAuditReport,
    saveVisibilityAuditReport
} from './visibilityAudit';

const GAP_STORAGE_KEY = 'localpulse_gap_analysis';
const KEYWORDS_STORAGE_KEY = 'localpulse_tracked_keywords';

type TrackedKeyword = {
    keyword: string;
    avgRank: number;
    top3Percentage: number;
    updatedAt: string;
};

type LastAuditSummary = {
    total: number;
    bandLabel: string;
    createdAt: string;
    query: string;
};

function loadGapAnalysis(): any | null {
    try {
        const raw = sessionStorage.getItem(GAP_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.gapAnalysis || !Array.isArray(parsed?.grid)) return null;
        return parsed;
    } catch {
        return null;
    }
}

function saveGapAnalysis(data: any) {
    try {
        sessionStorage.setItem(GAP_STORAGE_KEY, JSON.stringify(data));
    } catch {
        /* ignore */
    }
}

function clearGapAnalysis() {
    try {
        sessionStorage.removeItem(GAP_STORAGE_KEY);
    } catch {
        /* ignore */
    }
}

function loadTrackedKeywordsLocal(): TrackedKeyword[] {
    try {
        const raw = sessionStorage.getItem(KEYWORDS_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveTrackedKeywordsLocal(list: TrackedKeyword[]) {
    try {
        sessionStorage.setItem(KEYWORDS_STORAGE_KEY, JSON.stringify(list));
    } catch {
        /* ignore */
    }
}

function upsertTrackedKeyword(list: TrackedKeyword[], entry: TrackedKeyword): TrackedKeyword[] {
    const key = entry.keyword.toLowerCase();
    return [entry, ...list.filter((k) => k.keyword.toLowerCase() !== key)].slice(0, 12);
}

const AUDIT_STEPS = [
    'Saving prospect details',
    'Checking if the website is live',
    'Researching Google Maps / GBP',
    'Comparing NAP & listing gaps',
    'Writing the shareable report'
];

export default function RankTracker() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [isGeneratingGap, setIsGeneratingGap] = useState(false);
    const [gapAnalysis, setGapAnalysis] = useState<string | null>(null);
    const [gridData, setGridData] = useState<number[][]>([]);
    const [keyword, setKeyword] = useState('');
    const [activeKeyword, setActiveKeyword] = useState('');
    const [businessCategory, setBusinessCategory] = useState('');
    const [competitors, setCompetitors] = useState<any[]>([]);
    const [trackedKeywords, setTrackedKeywords] = useState<TrackedKeyword[]>([]);
    const [lastAudit, setLastAudit] = useState<LastAuditSummary | null>(null);
    const [hasAuditReport, setHasAuditReport] = useState(false);
    const [showRankGrid, setShowRankGrid] = useState(false);
    const [error, setError] = useState('');

    const [showAuditForm, setShowAuditForm] = useState(false);
    const [businessName, setBusinessName] = useState('');
    const [address, setAddress] = useState('');
    const [city, setCity] = useState('');
    const [service, setService] = useState('');
    const [serviceOther, setServiceOther] = useState('');
    const [website, setWebsite] = useState('');
    const [phone, setPhone] = useState('');
    const [placeId, setPlaceId] = useState('');
    const [lat, setLat] = useState<number | null>(null);
    const [lng, setLng] = useState<number | null>(null);
    const [auditError, setAuditError] = useState('');
    const [auditRunning, setAuditRunning] = useState(false);
    const [auditStep, setAuditStep] = useState(0);

    useEffect(() => {
        const saved = loadGapAnalysis();
        if (saved) {
            setGapAnalysis(saved.gapAnalysis);
            setGridData(Array.isArray(saved.grid) ? saved.grid : []);
            setCompetitors(Array.isArray(saved.competitors) ? saved.competitors : []);
            if (saved.keyword) {
                setKeyword(saved.keyword);
                setActiveKeyword(saved.keyword);
            }
            if (saved.center && Number.isFinite(saved.center.lat) && Number.isFinite(saved.center.lng)) {
                setLat(saved.center.lat);
                setLng(saved.center.lng);
            }
        }
        setTrackedKeywords(loadTrackedKeywordsLocal());
        setHasAuditReport(Boolean(loadVisibilityAuditReport()));
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [biz, stats] = await Promise.all([
                    apiGet('/api/business').catch(() => null),
                    apiGet('/api/dashboard/stats').catch(() => null)
                ]);
                if (cancelled) return;

                if (biz) {
                    if (biz.name) setBusinessName(biz.name);
                    if (biz.category) setBusinessCategory(biz.category);
                    if (biz.address) {
                        setAddress(biz.address);
                        const parts = String(biz.address)
                            .split(',')
                            .map((p: string) => p.trim())
                            .filter(Boolean);
                        if (parts.length >= 2) setCity(parts[parts.length - 2] || parts[0]);
                        else if (parts[0]) setCity(parts[0]);
                    }
                    if (biz.website) setWebsite(biz.website);
                    if (biz.phone) setPhone(biz.phone);
                    if (biz.placeId) setPlaceId(biz.placeId);
                    if (biz.category && PRIMARY_SERVICES.includes(biz.category as any)) setService(biz.category);
                    else if (biz.category) {
                        setService('Other');
                        setServiceOther(biz.category);
                    }
                    let nextLat = typeof biz.lat === 'number' ? biz.lat : null;
                    let nextLng = typeof biz.lng === 'number' ? biz.lng : null;
                    if (nextLat == null || nextLng == null) {
                        const query = [biz.name, biz.address].filter(Boolean).join(', ');
                        const geo = await geocodeAddress(query || biz.address || '');
                        if (geo) {
                            nextLat = geo.lat;
                            nextLng = geo.lng;
                        }
                    }
                    if (!cancelled) {
                        if (typeof nextLat === 'number') setLat(nextLat);
                        if (typeof nextLng === 'number') setLng(nextLng);
                    }
                    if (!keyword.trim() && biz.category) {
                        setKeyword(`${biz.category} near me`);
                    }
                }

                if (stats?.lastVisibilityAudit?.total != null) {
                    setLastAudit(stats.lastVisibilityAudit);
                } else {
                    const report = loadVisibilityAuditReport();
                    if (report?.score?.total != null) {
                        setLastAudit({
                            total: report.score.total,
                            bandLabel: report.score.bandLabel || '',
                            createdAt: report.createdAt,
                            query: report.gbpLookup?.localRank?.query || report.input?.service || ''
                        });
                    }
                }
                if (Array.isArray(stats?.trackedKeywords) && stats.trackedKeywords.length) {
                    setTrackedKeywords(stats.trackedKeywords);
                    saveTrackedKeywordsLocal(stats.trackedKeywords);
                }
                setHasAuditReport(Boolean(loadVisibilityAuditReport()));
            } catch {
                /* business may be gated — form still works manually */
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once from profile/stats
    }, []);

    useEffect(() => {
        if (searchParams.get('from') === 'visibility-audit') {
            setShowAuditForm(true);
        }
    }, [searchParams]);

    // If we restored a grid but still have no coords, geocode from the profile address.
    useEffect(() => {
        if (!gridData.length) return;
        if (typeof lat === 'number' && typeof lng === 'number') return;
        const query = [businessName, address, city].filter(Boolean).join(', ');
        if (!query.trim()) return;
        let cancelled = false;
        (async () => {
            const geo = await geocodeAddress(query);
            if (cancelled || !geo) return;
            setLat(geo.lat);
            setLng(geo.lng);
            const saved = loadGapAnalysis();
            if (saved?.gapAnalysis) {
                saveGapAnalysis({ ...saved, center: geo });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [gridData, businessName, address, city, lat, lng]);

    const mapMarkers = useMemo(() => {
        if (typeof lat !== 'number' || typeof lng !== 'number' || !gridData.length) return [];

        const markers: MapMarker[] = [];
        if (showRankGrid) {
            markers.push(...geoGridMarkers(lat, lng, gridData, 1));
        }

        markers.push({
            lat,
            lng,
            label: 'You',
            title: businessName ? `${businessName} (You)` : 'Your business',
            highlight: true,
            color: '#0F172A'
        });

        let rivalIdx = 0;
        for (const comp of competitors) {
            const name = String(comp?.name || '');
            if (!name || /\(You\)/i.test(name)) continue;
            const cLat = Number(comp.lat);
            const cLng = Number(comp.lng);
            if (!Number.isFinite(cLat) || !Number.isFinite(cLng)) continue;
            rivalIdx += 1;
            if (rivalIdx > 5) break;
            markers.push({
                lat: cLat,
                lng: cLng,
                label: `C${rivalIdx}`,
                title: `${name}${comp.rating ? ` · ${comp.rating}★` : ''}`,
                color: '#475569'
            });
        }

        return markers;
    }, [lat, lng, gridData, competitors, businessName, showRankGrid]);

    const mapCompetitors = useMemo(() => {
        return competitors
            .filter((c) => c?.name && !/\(You\)/i.test(String(c.name)))
            .slice(0, 5)
            .map((c, i) => ({
                label: `C${i + 1}`,
                name: c.name as string,
                rating: c.rating,
                reviews: c.reviews,
                hasPin: Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng))
            }));
    }, [competitors]);

    const displayKeyword = activeKeyword || keyword || (businessCategory ? `${businessCategory} near me` : '');

    const resolveMapCenter = async (): Promise<{ lat: number; lng: number } | null> => {
        if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
        const query = [businessName, address, city].filter(Boolean).join(', ');
        const geo = await geocodeAddress(query);
        if (geo) {
            setLat(geo.lat);
            setLng(geo.lng);
            return geo;
        }
        return null;
    };

    const handleGenerateGap = async () => {
        const effective =
            keyword.trim() || (businessCategory ? `${businessCategory} near me` : '');
        if (!effective) {
            setError('Enter a ranking keyword (e.g. South Indian restaurant near me) or set your business category.');
            return;
        }
        if (!keyword.trim()) setKeyword(effective);

        setIsGeneratingGap(true);
        setError('');
        try {
            const data = await apiPost('/api/ai/gap-analysis', { keyword: effective });
            const usedKeyword = data.keyword || effective;
            const nextGap = data.gapAnalysis || '';
            const nextGrid = Array.isArray(data.grid) ? data.grid : [];
            const nextCompetitors = Array.isArray(data.competitors) ? data.competitors : [];
            setGapAnalysis(nextGap);
            setGridData(nextGrid);
            setCompetitors(nextCompetitors);
            setKeyword(usedKeyword);
            setActiveKeyword(usedKeyword);

            let center: { lat: number; lng: number } | null = null;
            if (data?.center && Number.isFinite(data.center.lat) && Number.isFinite(data.center.lng)) {
                center = { lat: Number(data.center.lat), lng: Number(data.center.lng) };
                setLat(center.lat);
                setLng(center.lng);
            } else {
                center = await resolveMapCenter();
            }

            if (nextGap) {
                saveGapAnalysis({
                    keyword: usedKeyword,
                    gapAnalysis: nextGap,
                    grid: nextGrid,
                    competitors: nextCompetitors,
                    center,
                    savedAt: new Date().toISOString()
                });
            }

            const ranks = nextGrid.flat().filter((n: any) => typeof n === 'number');
            const avgRank = ranks.length
                ? Number((ranks.reduce((a: number, b: number) => a + b, 0) / ranks.length).toFixed(1))
                : Number(data.trackedKeywords?.[0]?.avgRank) || 0;
            const top3Percentage = ranks.length
                ? Math.round((ranks.filter((r: number) => r <= 3).length / ranks.length) * 100)
                : Number(data.trackedKeywords?.[0]?.top3Percentage) || 0;

            const entry: TrackedKeyword = {
                keyword: usedKeyword,
                avgRank,
                top3Percentage,
                updatedAt: new Date().toISOString()
            };
            const nextKeywords = Array.isArray(data.trackedKeywords)
                ? data.trackedKeywords
                : upsertTrackedKeyword(trackedKeywords, entry);
            setTrackedKeywords(nextKeywords);
            saveTrackedKeywordsLocal(nextKeywords);
            await updateDashboardStats({ trackedKeywords: nextKeywords });

            if (nextGrid.length && !center) {
                setError(
                    'Gap analysis saved, but map pins need a location. Add a full address on Business Profile (or enable Geocoding on your Maps key), then reopen this page.'
                );
            }

            await logDashboardActivity({
                type: 'rank',
                message: `GeoGrid analysis for "${usedKeyword}".`,
                icon: 'TrendingUp',
                color: 'text-[#D97706]'
            });
        } catch (err: any) {
            setError(err.message || 'Gap analysis failed');
        } finally {
            setIsGeneratingGap(false);
        }
    };

    const loadKeyword = (row: TrackedKeyword) => {
        setKeyword(row.keyword);
        setActiveKeyword(row.keyword);
        const saved = loadGapAnalysis();
        if (saved?.keyword === row.keyword && saved.gapAnalysis) {
            setGapAnalysis(saved.gapAnalysis);
            setGridData(Array.isArray(saved.grid) ? saved.grid : []);
            setCompetitors(Array.isArray(saved.competitors) ? saved.competitors : []);
            if (saved.center && Number.isFinite(saved.center.lat) && Number.isFinite(saved.center.lng)) {
                setLat(saved.center.lat);
                setLng(saved.center.lng);
            }
        }
    };

    const runVisibilityAudit = async () => {
        const resolvedService = service === 'Other' ? serviceOther.trim() : service;
        if (!businessName.trim() || !address.trim() || !resolvedService) {
            setAuditError('Business name, address/town, and primary service are required.');
            return;
        }
        setAuditError('');
        setAuditRunning(true);
        setAuditStep(0);
        const timers = AUDIT_STEPS.map((_, i) => setTimeout(() => setAuditStep(i), i * 900));
        try {
            const data = await apiPost('/api/visibility-audit', {
                businessName: businessName.trim(),
                address: address.trim(),
                city: city.trim() || undefined,
                service: resolvedService,
                website: website.trim() || undefined,
                phone: phone.trim() || undefined,
                placeId: placeId || undefined,
                lat,
                lng
            });
            setAuditStep(AUDIT_STEPS.length - 1);
            saveVisibilityAuditReport(data);
            setHasAuditReport(true);
            const summary: LastAuditSummary = {
                total: Number(data?.score?.total) || 0,
                bandLabel: String(data?.score?.bandLabel || data?.score?.band || ''),
                createdAt: String(data?.createdAt || new Date().toISOString()),
                query: String(data?.gbpLookup?.localRank?.query || resolvedService)
            };
            setLastAudit(summary);
            await updateDashboardStats({ lastVisibilityAudit: summary });
            await logDashboardActivity({
                type: 'audit',
                message: `Local Visibility Audit scored ${data?.score?.total ?? '—'}/100.`,
                icon: 'Radar',
                color: 'text-[#F59E0B]'
            }).catch(() => undefined);
            setShowAuditForm(false);
            navigate('/visibility-audit/report');
        } catch (err: any) {
            setAuditError(err.message || 'Visibility audit failed');
        } finally {
            timers.forEach(clearTimeout);
            setAuditRunning(false);
        }
    };

    const auditDateLabel = lastAudit?.createdAt
        ? new Date(lastAudit.createdAt).toLocaleDateString()
        : '';

    return (
        <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-12">
            <VisibilityFixBanner />

            <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-[#0F172A]">Local Search Grid</h1>
                    <p className="text-gray-500 mt-2">
                        Local Pack ranks on a real map around your business — plus a free visibility audit.
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                    <input
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        className="px-4 py-2.5 bg-white border border-[#E2E8F0] rounded-xl text-sm font-semibold w-full md:w-64"
                        placeholder="e.g. South Indian restaurant near me"
                    />
                    <button
                        type="button"
                        onClick={() => setShowAuditForm(true)}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0F172A] hover:bg-[#111827] text-white rounded-xl text-sm font-bold cursor-pointer whitespace-nowrap"
                    >
                        <Radar className="w-4 h-4 text-amber-300" />
                        Local Visibility Audit
                    </button>
                </div>
            </div>
            {error && (
                <p className="mb-6 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8 items-stretch">
                <div className="bg-white p-5 md:p-6 rounded-2xl border border-[#E2E8F0] shadow-sm flex flex-col min-h-[220px]">
                    <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Audit score & track</p>
                            <h2 className="text-lg font-semibold text-[#0F172A] flex items-center gap-2 mt-1">
                                <Radar className="w-5 h-5 text-[#F59E0B]" /> Local Visibility Audit
                            </h2>
                        </div>
                        {lastAudit ? (
                            <div className="text-right shrink-0">
                                <div className="text-3xl font-black text-[#0F172A] leading-none">
                                    {lastAudit.total}
                                    <span className="text-base font-bold text-gray-400">/100</span>
                                </div>
                                {lastAudit.bandLabel && (
                                    <p className="text-xs font-bold text-[#D97706] mt-1">{lastAudit.bandLabel}</p>
                                )}
                            </div>
                        ) : null}
                    </div>
                    {lastAudit ? (
                        <>
                            <p className="text-sm text-gray-600 mb-3">
                                Last run {auditDateLabel}
                                {lastAudit.query ? ` · ${lastAudit.query}` : ''}
                            </p>
                            <div className="mt-auto flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    disabled={!hasAuditReport}
                                    onClick={() => navigate('/visibility-audit/report')}
                                    className="inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-[#0F172A] hover:bg-[#111827] text-white text-sm font-bold rounded-lg cursor-pointer disabled:opacity-50"
                                >
                                    <FileText className="w-4 h-4" /> View report
                                </button>
                                <button
                                    type="button"
                                    disabled={!hasAuditReport}
                                    onClick={() => navigate('/visibility-audit/report?download=1')}
                                    className="inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-[#F8FAFC] hover:bg-[#E2E8F0] border border-[#E2E8F0] text-[#0F172A] text-sm font-bold rounded-lg cursor-pointer disabled:opacity-50"
                                >
                                    <Download className="w-4 h-4" /> Download PDF
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowAuditForm(true)}
                                    className="inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-[#F59E0B] hover:bg-[#D97706] text-white text-sm font-bold rounded-lg cursor-pointer"
                                >
                                    Re-run audit
                                </button>
                            </div>
                            {!hasAuditReport && (
                                <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                    Score is saved, but the full report is only in this browser session. Re-run the audit to
                                    regenerate the detailed report.
                                </p>
                            )}
                        </>
                    ) : (
                        <>
                            <p className="text-sm text-gray-500 mb-3 flex-1">
                                No audit yet. Run a free Local Visibility Audit to see your score here and open the report
                                anytime.
                            </p>
                            <button
                                type="button"
                                onClick={() => setShowAuditForm(true)}
                                className="mt-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0F172A] hover:bg-[#111827] text-white text-sm font-bold rounded-xl cursor-pointer self-start"
                            >
                                <Radar className="w-4 h-4 text-amber-300" /> Run Local Visibility Audit
                            </button>
                        </>
                    )}
                </div>

                <div className="bg-white p-5 md:p-6 rounded-2xl border border-[#E2E8F0] shadow-sm flex flex-col min-h-[220px]">
                    <div className="flex items-center gap-2 mb-2">
                        <ListOrdered className="w-5 h-5 text-[#0F172A]" />
                        <h2 className="text-lg font-semibold text-[#0F172A]">Ranking keywords</h2>
                    </div>
                    <p className="text-sm text-gray-500 mb-3">
                        Keywords you have run through Gap Analysis, with average pack rank and Local 3-Pack coverage.
                    </p>
                    {trackedKeywords.length ? (
                        <div className="mt-auto overflow-x-auto rounded-xl border border-[#E2E8F0]">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-[#F8FAFC] text-gray-500 border-b border-[#E2E8F0]">
                                    <tr>
                                        <th className="px-3 py-2.5 font-bold">Keyword</th>
                                        <th className="px-3 py-2.5 font-bold">Avg rank</th>
                                        <th className="px-3 py-2.5 font-bold">Top 3%</th>
                                        <th className="px-3 py-2.5 font-bold"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#E2E8F0]">
                                    {trackedKeywords.map((row) => (
                                        <tr key={row.keyword}>
                                            <td className="px-3 py-2.5 font-semibold text-[#0F172A]">{row.keyword}</td>
                                            <td className="px-3 py-2.5 font-bold text-[#D97706]">{row.avgRank || '—'}</td>
                                            <td className="px-3 py-2.5 text-gray-600 font-semibold">
                                                {row.top3Percentage ?? '—'}%
                                            </td>
                                            <td className="px-3 py-2.5 text-right">
                                                <button
                                                    type="button"
                                                    onClick={() => loadKeyword(row)}
                                                    className="inline-flex items-center px-2.5 py-1 text-xs font-bold text-[#0F172A] bg-[#F8FAFC] hover:bg-[#E2E8F0] border border-[#E2E8F0] rounded-full cursor-pointer"
                                                >
                                                    Load
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="mt-auto rounded-xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-4 py-6 text-sm text-gray-500 text-center">
                            No tracked keywords yet. Generate Gap Analysis to start the list.
                        </div>
                    )}
                </div>
            </div>

            {showAuditForm && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="visibility-audit-title"
                    onClick={(e) => {
                        if (e.target === e.currentTarget && !auditRunning) setShowAuditForm(false);
                    }}
                >
                    <section
                        id="visibility-audit"
                        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[#E2E8F0] bg-gradient-to-br from-[#0F172A] to-[#1e293b] text-white p-6 md:p-8 shadow-xl"
                    >
                        <button
                            type="button"
                            disabled={auditRunning}
                            onClick={() => setShowAuditForm(false)}
                            className="absolute top-4 right-4 p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 cursor-pointer disabled:opacity-50"
                            aria-label="Close"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="flex items-start gap-3 mb-4 pr-10">
                            <div className="p-2 rounded-xl bg-amber-400/20">
                                <Radar className="w-6 h-6 text-amber-300" />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">
                                    LocalPulse Visibility Score
                                </p>
                                <h2 id="visibility-audit-title" className="text-2xl font-bold mt-1">
                                    Free Local Visibility Audit
                                </h2>
                                <p className="text-sm text-white/70 mt-1">
                                    GBP/Maps-first score out of 100 — website, NAP, reviews, and “service near town”
                                    Top 10.
                                </p>
                            </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-3">
                            <label className="text-sm">
                                <span className="font-semibold text-white/80">Business name *</span>
                                <input
                                    value={businessName}
                                    onChange={(e) => setBusinessName(e.target.value)}
                                    className="mt-1 w-full px-3 py-2 rounded-xl bg-white text-[#0F172A] text-sm font-semibold"
                                    placeholder="Acme Plumbing"
                                />
                            </label>
                            <label className="text-sm">
                                <span className="font-semibold text-white/80">Address / town *</span>
                                <input
                                    value={address}
                                    onChange={(e) => setAddress(e.target.value)}
                                    className="mt-1 w-full px-3 py-2 rounded-xl bg-white text-[#0F172A] text-sm font-semibold"
                                    placeholder="12 High St, Manchester"
                                />
                            </label>
                            <label className="text-sm">
                                <span className="font-semibold text-white/80">Town / city</span>
                                <input
                                    value={city}
                                    onChange={(e) => setCity(e.target.value)}
                                    className="mt-1 w-full px-3 py-2 rounded-xl bg-white text-[#0F172A] text-sm font-semibold"
                                    placeholder="Manchester"
                                />
                            </label>
                            <label className="text-sm">
                                <span className="font-semibold text-white/80">Primary service *</span>
                                <select
                                    value={service}
                                    onChange={(e) => setService(e.target.value)}
                                    className="mt-1 w-full px-3 py-2 rounded-xl bg-white text-[#0F172A] text-sm font-semibold"
                                >
                                    <option value="">Select service</option>
                                    {PRIMARY_SERVICES.map((s) => (
                                        <option key={s} value={s}>
                                            {s}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            {service === 'Other' && (
                                <label className="text-sm md:col-span-2">
                                    <span className="font-semibold text-white/80">Other service *</span>
                                    <input
                                        value={serviceOther}
                                        onChange={(e) => setServiceOther(e.target.value)}
                                        className="mt-1 w-full px-3 py-2 rounded-xl bg-white text-[#0F172A] text-sm font-semibold"
                                        placeholder="e.g. drain clearance"
                                    />
                                </label>
                            )}
                            <label className="text-sm">
                                <span className="font-semibold text-white/80">Website (optional)</span>
                                <input
                                    value={website}
                                    onChange={(e) => setWebsite(e.target.value)}
                                    className="mt-1 w-full px-3 py-2 rounded-xl bg-white text-[#0F172A] text-sm font-semibold"
                                    placeholder="https://"
                                />
                            </label>
                            <label className="text-sm">
                                <span className="font-semibold text-white/80">Phone (optional)</span>
                                <input
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    className="mt-1 w-full px-3 py-2 rounded-xl bg-white text-[#0F172A] text-sm font-semibold"
                                    placeholder="07…"
                                />
                            </label>
                        </div>

                        {auditError && (
                            <p className="mt-4 text-sm text-red-200 bg-red-500/20 border border-red-400/30 rounded-xl px-3 py-2">
                                {auditError}
                            </p>
                        )}

                        {auditRunning && (
                            <div className="mt-5 space-y-2">
                                {AUDIT_STEPS.map((step, i) => (
                                    <div
                                        key={step}
                                        className={`flex items-center gap-2 text-sm ${
                                            i <= auditStep ? 'text-amber-200 font-semibold' : 'text-white/40'
                                        }`}
                                    >
                                        {i === auditStep && auditRunning ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <span className="w-4 h-4 inline-flex items-center justify-center text-xs">
                                                {i < auditStep ? '✓' : i + 1}
                                            </span>
                                        )}
                                        {step}
                                    </div>
                                ))}
                            </div>
                        )}

                        <button
                            type="button"
                            disabled={auditRunning}
                            onClick={runVisibilityAudit}
                            className="mt-5 inline-flex items-center gap-2 px-6 py-3 bg-amber-400 hover:bg-amber-300 text-[#0F172A] rounded-xl font-bold disabled:opacity-70 cursor-pointer"
                        >
                            {auditRunning ? <Loader2 className="w-5 h-5 animate-spin" /> : <Radar className="w-5 h-5" />}
                            {auditRunning ? 'Running audit…' : 'Run Free Local Visibility Audit'}
                        </button>
                    </section>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8 items-start">
                <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-sm">
                    <div className="flex justify-between items-start mb-4 gap-3 flex-wrap">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <Map className="w-5 h-5 text-[#0F172A]" /> Keyword: {displayKeyword || 'not set'}
                        </h2>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-gray-600 items-center">
                            <span className="flex items-center gap-1">
                                <div className="w-3 h-3 bg-[#0F172A] rounded-full"></div> You
                            </span>
                            <span className="flex items-center gap-1">
                                <div className="w-3 h-3 bg-[#475569] rounded-full"></div> Competitors
                            </span>
                            {showRankGrid && (
                                <>
                                    <span className="flex items-center gap-1">
                                        <div className="w-3 h-3 bg-[#F59E0B] rounded-full"></div> Rank 1-3
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <div className="w-3 h-3 bg-[#D97706] rounded-full"></div> Rank 4-5
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <div className="w-3 h-3 bg-red-500 rounded-full"></div> Rank 11+
                                    </span>
                                </>
                            )}
                            <label className="inline-flex items-center gap-1.5 cursor-pointer ml-1">
                                <input
                                    type="checkbox"
                                    checked={showRankGrid}
                                    onChange={(e) => setShowRankGrid(e.target.checked)}
                                    className="rounded border-[#CBD5E1] text-[#F59E0B] focus:ring-[#F59E0B]"
                                />
                                Show rank grid
                            </label>
                        </div>
                    </div>

                    {mapMarkers.length ? (
                        <PlacesMap
                            markers={mapMarkers}
                            height={360}
                            title="Local competitors and ranks"
                            zoom={13}
                            showPlaceholder
                            placeholder={
                                mapsJsConfigured()
                                    ? 'Could not load Google Maps.'
                                    : 'Map pins are unavailable in this environment.'
                            }
                        />
                    ) : (
                        <div className="w-full h-[360px] rounded-xl border border-[#E2E8F0] bg-[#F1F5F9] flex flex-col items-center justify-center text-sm text-gray-500 px-6 text-center gap-2">
                            <Map className="w-8 h-8 text-gray-400" />
                            {!gridData.length
                                ? 'Run gap analysis to place your business and competitors on the map.'
                                : typeof lat !== 'number' || typeof lng !== 'number'
                                  ? 'Analysis is ready, but location is missing — save a full address on Business Profile so pins can be placed.'
                                  : 'Preparing map…'}
                        </div>
                    )}
                    <p className="text-center text-sm text-gray-500 mt-4 font-semibold">
                        <Crosshair className="w-4 h-4 inline mr-1 text-[#F59E0B]" />
                        {showRankGrid
                            ? 'Amber numbers = estimated Local Pack rank at search cells (not businesses). Slate C1–C5 = real same-service rivals.'
                            : 'Map shows your business and same-service rivals at real locations. Turn on “Show rank grid” for the 3×3 Local Pack estimate.'}
                    </p>
                </div>

                <div className="bg-[#F8FAFC] p-6 rounded-2xl border border-[#E2E8F0] shadow-sm self-start w-full">
                    <h2 className="text-lg font-semibold flex items-center gap-2 mb-2">
                        <Activity className="w-5 h-5 text-[#D97706]" /> AI Gap Analysis
                    </h2>
                    <p className="text-sm text-gray-500 mb-4 font-semibold">
                        Fills the map pins and competitor table for your keyword (same-service rivals only).
                    </p>

                    {!gapAnalysis ? (
                        <div className="flex flex-col items-center justify-center border-2 border-dashed border-[#E2E8F0] rounded-xl bg-white p-8">
                            <button
                                onClick={handleGenerateGap}
                                disabled={isGeneratingGap}
                                className="flex items-center gap-2 px-6 py-3 bg-[#0F172A] hover:bg-[#111827] text-white rounded-xl font-bold transition-all shadow-sm disabled:opacity-70 cursor-pointer"
                            >
                                <Sparkles className={`w-5 h-5 ${isGeneratingGap ? 'animate-spin' : ''}`} />
                                {isGeneratingGap ? 'Analyzing Ecosystem...' : 'Generate Gap Analysis'}
                            </button>
                        </div>
                    ) : (
                        <div className="bg-white p-5 rounded-xl border border-[#F59E0B]/30 shadow-sm animate-in zoom-in duration-300">
                            <h3 className="text-[#0F172A] font-bold mb-3 flex items-center gap-2">
                                <Sparkles className="w-5 h-5" /> Executive Insight
                            </h3>
                            <p className="text-gray-700 leading-relaxed text-sm mb-4">{gapAnalysis}</p>

                            {mapCompetitors.length > 0 && (
                                <div className="mb-4">
                                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                                        Competitors on map
                                    </p>
                                    <ul className="space-y-1.5">
                                        {mapCompetitors.map((c) => (
                                            <li
                                                key={c.label}
                                                className="flex items-center justify-between gap-2 text-sm border border-[#E2E8F0] rounded-lg px-3 py-2"
                                            >
                                                <span className="font-semibold text-[#0F172A]">
                                                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#475569] text-white text-[10px] font-bold mr-2">
                                                        {c.label}
                                                    </span>
                                                    {c.name}
                                                    {!c.hasPin && (
                                                        <span className="ml-2 text-[10px] font-bold text-gray-400">
                                                            no pin
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="text-gray-600 font-semibold shrink-0">
                                                    {c.rating || '—'}★
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => navigate('/posts')}
                                    className="px-4 py-2 bg-[#F59E0B] hover:bg-[#D97706] text-white text-sm font-bold rounded-lg cursor-pointer"
                                >
                                    Draft Required Post
                                </button>
                                <button
                                    onClick={() => {
                                        setGapAnalysis(null);
                                        setGridData([]);
                                        setCompetitors([]);
                                        setActiveKeyword('');
                                        clearGapAnalysis();
                                    }}
                                    className="px-4 py-2 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0F172A] text-sm font-bold rounded-lg cursor-pointer"
                                >
                                    Reset
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
                <div className="p-5 border-b border-[#E2E8F0] flex items-center gap-2 bg-[#F8FAFC]">
                    <Users className="w-5 h-5 text-[#0F172A]" />
                    <h2 className="font-semibold text-[#0F172A]">Competitor Intelligence</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-[#F8FAFC] text-gray-500 border-b border-[#E2E8F0]">
                            <tr>
                                <th className="px-6 py-4 font-bold">Business Name</th>
                                <th className="px-6 py-4 font-bold">Rating</th>
                                <th className="px-6 py-4 font-bold">Review Vol</th>
                                <th className="px-6 py-4 font-bold">Posts / Wk</th>
                                <th className="px-6 py-4 font-bold">Total Photos</th>
                                <th className="px-6 py-4 font-bold">Momentum</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0]">
                            {competitors.length ? (
                                competitors.map((comp, idx) => (
                                    <tr key={idx} className={idx === 0 ? 'bg-[#F1F5F9]/50 font-bold' : ''}>
                                        <td className="px-6 py-4 whitespace-nowrap text-[#0F172A]">
                                            {comp.name}{' '}
                                            {idx === 0 && (
                                                <span className="ml-2 text-xs bg-[#F59E0B] text-white px-2 py-0.5 rounded font-bold">
                                                    You
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 font-black text-[#D97706]">{comp.rating}</td>
                                        <td className="px-6 py-4 text-gray-600 font-semibold">{comp.reviews}</td>
                                        <td className="px-6 py-4 text-gray-600 font-semibold">{comp.posts}</td>
                                        <td className="px-6 py-4 text-gray-600 font-semibold">{comp.photos}</td>
                                        <td className="px-6 py-4">
                                            {comp.trend === 'up' ? (
                                                <TrendingUp className="w-4 h-4 text-green-600" />
                                            ) : (
                                                <TrendingDown className="w-4 h-4 text-red-500" />
                                            )}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-gray-400 text-center">
                                        No competitor data until you run analysis.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
