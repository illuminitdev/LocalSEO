import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Map as MapIcon,
    Users,
    Sparkles,
    Target,
    Download,
    Loader2,
    ArrowUp,
    ArrowDown,
    Minus,
    AlertCircle,
    Upload,
    FileText,
    MessageSquare,
    Star,
    TrendingUp,
    MoreVertical,
    BarChart3,
    Play
} from 'lucide-react';
import { ago, apiDelete, apiGet, apiPost, logDashboardActivity, updateDashboardStats, cn, type ApiError } from '../../shared/utils';
import PlacesMap, { mapsJsConfigured, type MapMarker } from '../../shared/PlacesMap';
import LocationPicker, { type SavedLocation } from '../../shared/LocationPicker';
import { useCredits } from '../../shared/CreditsContext';
import { creditErrorMessage } from '../../shared/creditMessages';
import { useServiceDetection } from '../../shared/useServiceDetection';

type TrackedKeyword = {
    keyword: string;
    avgRank: number;
    top3Percentage: number;
    updatedAt: string;
    previousAvgRank?: number | null;
    health?: number;
};

type ShareRow = { name: string; sharePct: number; isYou?: boolean };

type Place = { name: string; lat: number | null; lng: number | null; rating?: number; reviews?: number };

type GapRun = {
    competitors?: Place[];
    keyword: string;
    /** Missing once a scan is older than 90 days (only the summary numbers are kept). */
    grid: number[][] | null;
    gridSize?: number;
    center?: { lat: number; lng: number } | null;
    competitorShare?: ShareRow[];
    avgRank?: number;
    top3Percentage?: number;
    updatedAt?: string;
};

type Insight = { type: string; title: string; body: string; action?: { label: string; to: string } };
type Opportunity = { keyword: string; rank: number; action: { label: string; to: string } };

// Hidden 3×3 sample around the center: used only to score rank / share, never drawn on the map.
const SAMPLE_SIZE = 3;

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const SCAN_CONCURRENCY = 5;

const insightIcon = (label?: string) => {
    if (!label) return FileText;
    if (/gallery|photo/i.test(label)) return Upload;
    return FileText;
};

const opportunityIcon = (label: string) => (/review/i.test(label) ? Star : MessageSquare);

function healthTone(score: number) {
    if (score >= 80) return 'bg-emerald-500';
    if (score >= 60) return 'bg-[var(--brand-primary)]';
    return 'bg-[#9A3A0A]';
}

export default function RankTracker() {
    const navigate = useNavigate();

    const [keyword, setKeyword] = useState('');
    const gridSize = SAMPLE_SIZE;
    const [places, setPlaces] = useState<Place[]>([]);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    // The business's one keyword list, shared with the Visibility Tracker and AI Insights.
    const [sharedKeywords, setSharedKeywords] = useState<string[]>([]);
    const [grid, setGrid] = useState<number[][]>([]);
    const [share, setShare] = useState<ShareRow[]>([]);
    const [trackedKeywords, setTrackedKeywords] = useState<TrackedKeyword[]>([]);
    const [gapRuns, setGapRuns] = useState<GapRun[]>([]);
    const [insights, setInsights] = useState<Insight[]>([]);
    const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
    const [showAllKeywords, setShowAllKeywords] = useState(false);

    const [scanning, setScanning] = useState(false);
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const [businessName, setBusinessName] = useState('');
    const [businessCategory, setBusinessCategory] = useState('');
    const [services, setServices] = useState<string[]>([]);
    const [servicesPending, setServicesPending] = useState(false);

    // Scans always run from one of the saved locations (the business address is the first one).
    const { refresh: refreshCredits } = useCredits();
    const [locations, setLocations] = useState<SavedLocation[]>([]);
    const [locationId, setLocationId] = useState('');
    const [locationLimit, setLocationLimit] = useState(1);
    const [canAddLocation, setCanAddLocation] = useState(false);
    const [needsAddress, setNeedsAddress] = useState(false);
    const selectedLocation = locations.find((l) => l.id === locationId) || null;
    const lat = selectedLocation?.lat ?? null;
    const lng = selectedLocation?.lng ?? null;

    const applyRun = (run: GapRun) => {
        setKeyword(run.keyword);
        setGrid(Array.isArray(run.grid) ? run.grid : []);
        setShare(Array.isArray(run.competitorShare) ? run.competitorShare : []);
        setPlaces(Array.isArray(run.competitors) ? run.competitors : []);
    };

    const applyLocations = (data: any) => {
        if (data && Array.isArray(data.sharedKeywords)) setSharedKeywords(data.sharedKeywords);
        const list: SavedLocation[] = Array.isArray(data?.locations) ? data.locations : [];
        setLocations(list);
        setLocationId(data?.location?.id || list[0]?.id || '');
        setLocationLimit(Number(data?.locationLimit) || 1);
        setCanAddLocation(Boolean(data?.canAddLocation));
        setNeedsAddress(Boolean(data?.needsAddress));
    };

    const loadInsights = async (refresh = false, forLocation = locationId) => {
        try {
            const data = await apiPost('/api/ai/rank-insights', { refresh, locationId: forLocation || undefined });
            setInsights(Array.isArray(data?.insights) ? data.insights : []);
            setOpportunities(Array.isArray(data?.opportunities) ? data.opportunities : []);
        } catch {
            // insights are optional
        }
    };

    // Keyword ideas + services (typed on the profile and read from the website).
    const loadSuggestions = (isCancelled: () => boolean = () => false) =>
        apiGet('/api/rank/suggestions')
            .then((d) => {
                if (isCancelled()) return;
                setSuggestions(Array.isArray(d?.keywords) ? d.keywords : []);
                setServices(Array.isArray(d?.services) ? d.services.slice(0, 6) : []);
                setServicesPending(Boolean(d?.servicesPending));
            })
            .catch(() => {});

    useServiceDetection(servicesPending, () => loadSuggestions());

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const [biz, state] = await Promise.all([
                apiGet('/api/business').catch(() => null),
                apiGet('/api/rank/state').catch(() => null)
            ]);
            if (cancelled) return;

            let defaultKeyword = '';
            if (biz) {
                if (biz.name) setBusinessName(biz.name);
                if (biz.category) {
                    setBusinessCategory(biz.category);
                    defaultKeyword = `${biz.category} near me`;
                }
            }

            loadSuggestions(() => cancelled);
            applyLocations(state);
            const runs: GapRun[] = Array.isArray(state?.gapAnalyses) ? state.gapAnalyses : [];
            setGapRuns(runs);
            setTrackedKeywords(Array.isArray(state?.trackedKeywords) ? state.trackedKeywords : []);
            if (runs[0]) {
                applyRun(runs[0]);
                loadInsights(false, state?.location?.id || '');
            } else if (defaultKeyword) {
                setKeyword(defaultKeyword);
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Switching location loads that location's own scan history.
    const changeLocation = async (id: string) => {
        setLocationId(id);
        setError('');
        setNotice('');
        setGrid([]);
        setShare([]);
        setPlaces([]);
        setInsights([]);
        setOpportunities([]);
        try {
            const state = await apiGet(`/api/rank/state?locationId=${encodeURIComponent(id)}`);
            applyLocations(state);
            const runs: GapRun[] = Array.isArray(state?.gapAnalyses) ? state.gapAnalyses : [];
            setGapRuns(runs);
            setTrackedKeywords(Array.isArray(state?.trackedKeywords) ? state.trackedKeywords : []);
            if (runs[0]) {
                applyRun(runs[0]);
                loadInsights(false, id);
            }
        } catch (err: any) {
            setError(err?.message || 'Could not load that location.');
        }
    };

    const addLocation = async (addressText: string, label: string) => {
        try {
            const data = await apiPost('/api/locations', { address: addressText, label });
            applyLocations(data);
            await changeLocation(data?.location?.id || data?.added?.id);
        } catch (err: any) {
            return err?.message || 'Could not add that location.';
        }
    };

    const removeLocation = async (id: string) => {
        try {
            await apiDelete(`/api/locations/${encodeURIComponent(id)}`);
            const primary = locations.find((l) => l.isPrimary)?.id || '';
            await changeLocation(primary);
        } catch (err: any) {
            return err?.message || 'Could not remove that location.';
        }
    };

    const hasCenter = typeof lat === 'number' && typeof lng === 'number';
    const size = grid.length;

    const mapMarkers = useMemo(() => {
        const markers: MapMarker[] = [];
        if (!hasCenter) return markers;
        markers.push({
            lat: lat as number,
            lng: lng as number,
            label: selectedLocation?.isPrimary === false ? 'Center' : 'You',
            title:
                selectedLocation?.isPrimary === false
                    ? selectedLocation.label || 'Search center'
                    : businessName
                      ? `${businessName} (You)`
                      : 'Your business',
            highlight: true,
            color: '#0F172A'
        });
        places
            .filter((c) => c.lat != null && c.lng != null)
            .slice(0, 8)
            .forEach((c, i) => {
                markers.push({
                    lat: c.lat as number,
                    lng: c.lng as number,
                    label: `C${i + 1}`,
                    title: `${c.name}${c.rating ? ` · ${c.rating}★` : ''}${c.reviews ? ` (${c.reviews})` : ''}`,
                    color: '#3B82F6'
                });
            });
        return markers;
    }, [lat, lng, hasCenter, selectedLocation, businessName, places]);

    const lastScan = gapRuns.find((r) => r.keyword.toLowerCase() === keyword.trim().toLowerCase() && r.updatedAt) || null;
    const flat = grid.flat().filter((n) => Number.isFinite(n));
    const avgRank = flat.length ? (flat.reduce((a, b) => a + b, 0) / flat.length).toFixed(1) : '—';

    const shareRows = useMemo(() => {
        const you = share.find((s) => s.isYou);
        const rivals = share.filter((s) => !s.isYou).slice(0, 4);
        return [{ name: 'Your Business', sharePct: you?.sharePct ?? 0, isYou: true }, ...rivals];
    }, [share]);

    const runEstimatedFallback = async (kw: string) => {
        const data = await apiPost('/api/ai/gap-analysis', { keyword: kw });
        const runs: GapRun[] = Array.isArray(data.gapAnalyses) ? data.gapAnalyses : [];
        setGapRuns(runs);
        setTrackedKeywords(Array.isArray(data.trackedKeywords) ? data.trackedKeywords : []);
        if (Array.isArray(data.grid)) setGrid(data.grid);
        setShare([]);
        setPlaces(
            (Array.isArray(data.competitors) ? data.competitors : [])
                .filter((c: any) => c?.name && !/\(You\)/i.test(String(c.name)) && Number.isFinite(Number(c.lat)))
                .map((c: any) => ({ name: c.name, lat: Number(c.lat), lng: Number(c.lng), rating: c.rating, reviews: c.reviews }))
        );
        setNotice('DataForSEO is not configured, so this scan shows estimated ranks instead of real Google Maps data.');
    };

    const handleRunScan = async () => {
        const kw = keyword.trim() || (businessCategory ? `${businessCategory} near me` : '');
        if (!kw) {
            setError('Enter a target keyword (e.g. plumber near me) or set your business category.');
            return;
        }
        if (!locationId) {
            setError('Add a full address on your Business profile page so we can locate your business.');
            return;
        }
        setKeyword(kw);
        setScanning(true);
        setError('');
        setNotice('');
        try {
            // Reserves the keyword for this month and pays for the scan before any point is requested.
            // A keyword already scanned this month comes back with its saved result and costs nothing.
            let scanId = '';
            try {
                const started = await apiPost('/api/rank/scan-start', { keyword: kw, locationId });
                scanId = String(started?.scanId || '');
            } catch (err: any) {
                if (err?.code === 'not_configured') {
                    await runEstimatedFallback(kw);
                    await loadInsights(true);
                    return;
                }
                if (err?.code === 'already_scanned') {
                    if (err.body?.run) applyRun(err.body.run as GapRun);
                    setNotice(`${err.message}${err.body?.nextAvailableAt ? ` You can scan it again after ${fmtDay(err.body.nextAvailableAt)}.` : ''}`);
                    return;
                }
                if (err?.code === 'grid_limit' || err?.code === 'keyword_limit') {
                    setError(err.message);
                    return;
                }
                throw err;
            }
            setSharedKeywords((list) => (list.some((k) => k.toLowerCase() === kw.toLowerCase()) ? list : [kw.toLowerCase(), ...list]));
            refreshCredits();
            const total = gridSize * gridSize;
            const rows: number[][] = Array.from({ length: gridSize }, () => new Array(gridSize).fill(21));
            const tally: Record<string, number> = {};
            const seen = new Map<string, Place>();
            let next = 0;
            let done = 0;
            let failed = 0;
            let notConfigured = false;
            let fatal: Error | null = null;
            let lastError = '';
            setProgress({ done: 0, total });

            const scanCell = async (row: number, col: number) => {
                const body = { keyword: kw, gridSize, row, col, scanId, locationId };
                for (let attempt = 0; attempt < 2; attempt++) {
                    try {
                        return await apiPost('/api/rank/scan-row', body);
                    } catch (err: any) {
                        if (err?.code === 'not_configured' || /need DataForSEO/i.test(err?.message || '')) throw err;
                        // Retry budget used up: count this point as failed (refunded at finish) instead of stopping the scan.
                        if (err?.code === 'scan_exhausted') return null;
                        if (['scan_not_started', 'insufficient_credits', 'upgrade_required'].includes(err?.code)) throw err;
                        if (/locate the grid center|Invalid grid|Keyword is required|Upgrade required|saved locations/i.test(err?.message || '')) throw err;
                        lastError = err?.message || lastError;
                        if (attempt === 1) return null;
                    }
                }
                return null;
            };

            const worker = async () => {
                while (next < total && !notConfigured && !fatal) {
                    const idx = next++;
                    const row = Math.floor(idx / gridSize);
                    const col = idx % gridSize;
                    try {
                        const data = await scanCell(row, col);
                        if (data) {
                            rows[row][col] = data.rank;
                            for (const name of data.top3 || []) tally[name] = (tally[name] || 0) + 1;
                            for (const pl of data.places || []) {
                                if (!pl?.name || pl.isYou || pl.lat == null || pl.lng == null) continue;
                                if (!seen.has(pl.name)) seen.set(pl.name, { name: pl.name, lat: pl.lat, lng: pl.lng, rating: pl.rating, reviews: pl.reviews });
                            }
                        } else {
                            failed += 1;
                        }
                    } catch (err: any) {
                        if (err?.code === 'not_configured' || /need DataForSEO/i.test(err?.message || '')) {
                            notConfigured = true;
                        } else {
                            fatal = err;
                        }
                        return;
                    }
                    done += 1;
                    setProgress({ done, total });
                    if (done % gridSize === 0 || done === total) {
                        setGrid(rows.map((r) => [...r]));
                    }
                }
            };
            await Promise.all(Array.from({ length: SCAN_CONCURRENCY }, worker));
            if (fatal) throw fatal;
            if (!notConfigured && failed > total / 2) {
                throw new Error(
                    /timeout|aborted/i.test(lastError)
                        ? 'Google Maps data is responding slowly right now, so most grid points timed out. Please try again in a few minutes.'
                        : `Most grid points failed to load from Google${lastError ? ` (${lastError})` : ''}. Please try again in a moment.`
                );
            }
            if (!notConfigured && failed > 0) {
                setNotice(`${failed} of ${total} points could not be checked and are shown as 20+.`);
            }

            if (notConfigured) {
                setGrid([]);
                await runEstimatedFallback(kw);
                await loadInsights(true);
                return;
            }

            const nearby = Array.from(seen.values())
                .sort((a, b) => (tally[b.name] || 0) - (tally[a.name] || 0) || (b.reviews || 0) - (a.reviews || 0))
                .slice(0, 8);
            setPlaces(nearby);
            const result = await apiPost('/api/rank/scan-finish', {
                competitors: nearby,
                keyword: kw,
                gridSize,
                grid: rows,
                tally,
                scanId,
                locationId,
                failedCells: failed
            });
            refreshCredits();
            setGapRuns(Array.isArray(result.gapAnalyses) ? result.gapAnalyses : []);
            setTrackedKeywords(Array.isArray(result.trackedKeywords) ? result.trackedKeywords : []);
            applyRun(result.run);
            updateDashboardStats({ trackedKeywords: result.trackedKeywords }).catch(() => {});
            await loadInsights(true);
            await logDashboardActivity({
                type: 'rank',
                message: `Local rank scan for "${kw}".`,
                icon: 'TrendingUp',
                color: 'text-[var(--brand-primary)]'
            });
        } catch (err: any) {
            const e = err as ApiError;
            if (e?.code === 'insufficient_credits') {
                setError(creditErrorMessage(e));
            } else {
                setError(e?.message || 'Scan failed');
            }
            refreshCredits();
        } finally {
            setScanning(false);
        }
    };

    const loadKeyword = (row: TrackedKeyword) => {
        const run = gapRuns.find((item) => item.keyword.toLowerCase() === row.keyword.toLowerCase());
        setError('');
        if (run) {
            applyRun(run);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            setKeyword(row.keyword);
            setGrid([]);
            setShare([]);
        }
    };

    const handleExport = () => {
        const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lines: string[] = ['Keyword,Avg rank,Top 3 %,Health,Updated'];
        for (const k of trackedKeywords) {
            lines.push([k.keyword, k.avgRank, k.top3Percentage, k.health ?? '', k.updatedAt].map(esc).join(','));
        }
        if (grid.length) {
            lines.push('', `Grid for "${keyword}" (${grid.length}x${grid.length}, row 1 = north)`);
            for (const row of grid) lines.push(row.join(','));
        }
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rank-tracker-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const keywordOptions = useMemo(() => {
        const set = new Set<string>(trackedKeywords.map((k) => k.keyword));
        if (businessCategory) {
            set.add(`${businessCategory} near me`);
            set.add(`best ${businessCategory}`);
        }
        for (const svc of services) set.add(`${svc} near me`);
        for (const kw of suggestions) set.add(kw);
        return Array.from(set);
    }, [trackedKeywords, businessCategory, services, suggestions]);

    const keywordPlaceholder = `e.g. ${services[0] || businessCategory || 'your main service'} near me`;

    const keywordRows = useMemo(() => {
        const tracked = new Map(trackedKeywords.map((k) => [k.keyword.toLowerCase(), k]));
        const rows: Array<TrackedKeyword & { scanned: boolean }> = [];
        const seen = new Set<string>();
        const push = (row: TrackedKeyword & { scanned: boolean }) => {
            const key = row.keyword.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            rows.push(row);
        };
        // 1. The shared keyword list (also in the Visibility Tracker): scanned ones show their saved result here.
        for (const kw of sharedKeywords) {
            const scan = tracked.get(kw.toLowerCase());
            push(scan ? { ...scan, scanned: true } : { keyword: kw, avgRank: 0, top3Percentage: 0, updatedAt: '', scanned: false });
        }
        // 2. Older saved scans at this address.
        for (const k of trackedKeywords) push({ ...k, scanned: true });
        // 3. Ideas (scanning one adds it to the shared list, within the plan limit).
        for (const kw of suggestions) push({ keyword: kw, avgRank: 0, top3Percentage: 0, updatedAt: '', scanned: false });
        return rows;
    }, [sharedKeywords, trackedKeywords, suggestions]);

    const visibleKeywords = showAllKeywords ? keywordRows : keywordRows.slice(0, 6);

    const scanKeyword = (kw: string) => {
        setKeyword(kw);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => document.getElementById('run-scan-btn')?.click(), 350);
    };

    const card = 'bg-white rounded-xl border border-[#E2E8F0] shadow-sm';
    const miniLabel = 'block text-[10px] font-semibold text-gray-500 mb-1.5';

    return (
        <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-12">
            {/* Header */}
            <div className="mb-5 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-[#0F172A]">Local Rank Tracker</h1>
                    <p className="text-sm text-gray-500 mt-1">Geographic visibility and competitor share across your service area.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        id="run-scan-btn"
                        onClick={handleRunScan}
                        disabled={scanning}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-ink)] text-[var(--brand-primary-foreground)] rounded-lg text-sm font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-70"
                    >
                        {scanning
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Play className="w-4 h-4 fill-current" />}
                        {scanning ? `Scanning ${progress.done}/${progress.total}` : 'Run Scan'}
                    </button>
                    <button
                        type="button"
                        onClick={handleExport}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm font-semibold text-[#0F172A] hover:bg-[#F8FAFC] cursor-pointer"
                    >
                        <Download className="w-4 h-4" /> Export
                    </button>
                </div>
            </div>

            {error && <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}
            {notice && (
                <p className="mb-4 flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {notice}
                </p>
            )}

            {/* Controls */}
            <div className={cn(card, 'p-4 mb-5 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(220px,auto)] gap-x-4 gap-y-3 items-start')}>
                <div className="min-w-0 flex flex-col">
                    <label className={miniLabel}>Target Keyword</label>
                    <div className="relative">
                        <input
                            list="rank-keywords"
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && !scanning && handleRunScan()}
                            placeholder={keywordPlaceholder}
                            className="w-full h-10 px-3 bg-white border border-[#E2E8F0] rounded-lg text-sm appearance-none [&::-webkit-calendar-picker-indicator]:!hidden [&::-webkit-list-button]:!hidden focus:outline-none focus:border-[var(--brand-primary)]"
                        />
                        <datalist id="rank-keywords">
                            {keywordOptions.map((k) => (
                                <option key={k} value={k} />
                            ))}
                        </datalist>
                    </div>
                </div>
                <div className="min-w-0 flex flex-col">
                    <label className={miniLabel}>Location</label>
                    {needsAddress ? (
                        <p className="h-10 flex items-center text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3">
                            Add a full address on your Business profile page to place your first location.
                        </p>
                    ) : (
                        <LocationPicker
                            locations={locations}
                            selectedId={locationId}
                            onSelect={changeLocation}
                            limit={locationLimit}
                            canAdd={canAddLocation}
                            disabled={scanning}
                            onAdd={addLocation}
                            onRemove={removeLocation}
                        />
                    )}
                </div>
                <div className="min-w-0 flex flex-col lg:text-right">
                    <span className={miniLabel} aria-hidden="true">&nbsp;</span>
                    <div className="h-10 flex items-center lg:justify-end">
                        <p className="text-xs text-gray-500 leading-none">
                            Avg. Rank: <span className="text-xl font-bold text-[var(--brand-primary)] ml-1 align-middle">{avgRank}</span>
                        </p>
                    </div>
                    {lastScan && (
                        <p className="mt-1 min-h-[16px] text-[10px] font-semibold leading-4 text-gray-500 lg:text-right">
                            Last scanned: {ago(lastScan.updatedAt)}
                        </p>
                    )}
                </div>
            </div>

            {/* Map + share */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-5 items-stretch">
                <div className={cn(card, 'lg:col-span-7 p-4 flex flex-col')}>
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                        <h2 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                            <MapIcon className="w-4 h-4 text-[var(--brand-primary)]" /> Local Competitors Map
                        </h2>
                        <div className="flex items-center gap-3 text-[11px] font-medium text-gray-500">
                            <span className="flex items-center gap-1.5">
                                <i className="w-2.5 h-2.5 rounded-full bg-[#0F172A]" /> You
                            </span>
                            <span className="flex items-center gap-1.5">
                                <i className="w-2.5 h-2.5 rounded-full bg-[#3B82F6]" /> Competitors
                            </span>
                        </div>
                    </div>
                    <div className="relative">
                        <PlacesMap
                            markers={mapMarkers}
                            height={320}
                            title="Local competitors"
                            zoom={places.length ? undefined : 12}
                            showPlaceholder
                            placeholder={
                                mapsJsConfigured()
                                    ? hasCenter
                                        ? 'Could not load Google Maps.'
                                        : 'Add a full address on your Business Profile to place the map.'
                                    : 'Map pins are unavailable in this environment.'
                            }
                        />
                        {scanning && (
                            <div className="absolute inset-x-3 bottom-3 bg-white/95 border border-[#E2E8F0] rounded-lg px-3 py-2 shadow-sm">
                                <div className="flex items-center justify-between text-[11px] font-medium text-gray-600 mb-1.5">
                                    <span>Scanning nearby rankings…</span>
                                    <span>
                                        {progress.done}/{progress.total}
                                    </span>
                                </div>
                                <div className="h-1.5 bg-[#F1F5F9] rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-[var(--brand-primary)] transition-all"
                                        style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                    <p className="mt-3 text-xs text-gray-500">
                        {places.length
                            ? `Showing your business and ${places.length} competitor${places.length === 1 ? '' : 's'} ranking for “${keyword}”. Click the map to move the search center.`
                            : `Run a scan to pin the competitors ranking for “${keyword || 'your keyword'}”. Click the map to move the search center.`}
                    </p>
                </div>

                <div className={cn(card, 'lg:col-span-5 p-6 flex flex-col')}>
                    <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2 mb-1">
                        <Target className="w-5 h-5 text-[var(--brand-primary)]" /> Competitor Map Share
                    </h2>
                    <p className="text-sm text-gray-500 mb-6">
                        Percentage of top 3 spots owned by each business around your location.
                    </p>
                    {!size ? (
                        <p className="text-sm text-gray-400 py-10 text-center my-auto">Run a scan to see who owns the top 3 spots.</p>
                    ) : (
                        <div className="space-y-5 my-auto">
                            {shareRows.map((row) => (
                                <div key={row.name}>
                                    <div className="flex items-center justify-between text-sm mb-2">
                                        <span className="flex items-center gap-2.5 font-semibold text-[#0F172A] min-w-0">
                                            <i
                                                className={cn(
                                                    'w-2.5 h-2.5 rounded-full shrink-0',
                                                    row.isYou ? 'bg-[var(--brand-primary)]' : 'bg-[#475569]'
                                                )}
                                            />
                                            <span className="truncate">{row.name}</span>
                                        </span>
                                        <span className="font-bold text-[#0F172A] ml-3">{row.sharePct}%</span>
                                    </div>
                                    <div className="h-2.5 bg-[#F1F5F9] rounded-full overflow-hidden">
                                        <div
                                            className={cn('h-full rounded-full', row.isYou ? 'bg-[var(--brand-primary)]' : 'bg-[#475569]')}
                                            style={{ width: `${Math.min(100, row.sharePct)}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Insights + opportunities */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-5 items-start">
                <div className={cn(card, 'lg:col-span-8 p-5')}>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-[var(--brand-primary)]" /> AI Ranking Insights
                        </h2>
                        {insights.some((i) => i.type === 'drop') && (
                            <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-[10px] font-bold uppercase tracking-wide">
                                Action needed
                            </span>
                        )}
                    </div>
                    {insights.length === 0 ? (
                        <p className="text-xs text-gray-400 py-6 text-center">
                            Run a scan to get AI insights on your rankings and competitors.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {insights.map((item, i) => {
                                const Icon = insightIcon(item.action?.label);
                                const isDrop = item.type === 'drop';
                                return (
                                    <div
                                        key={i}
                                        className={cn(
                                            'rounded-lg border p-4 border-l-4',
                                            isDrop ? 'border-[#E2E8F0] border-l-red-500 bg-white' : 'border-[#E2E8F0] border-l-[#CBD5E1] bg-white'
                                        )}
                                    >
                                        <p className={cn('text-sm font-bold mb-1', isDrop ? 'text-red-600' : 'text-[#0F172A]')}>{item.title}</p>
                                        <p className="text-xs text-gray-600 leading-relaxed mb-3">{item.body}</p>
                                        {item.action &&
                                            (isDrop ? (
                                                <button
                                                    type="button"
                                                    onClick={() => navigate(item.action!.to)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#9A3A0A] hover:bg-[#7C2D12] text-white rounded-md text-xs font-semibold cursor-pointer"
                                                >
                                                    {item.action.label} <Icon className="w-3.5 h-3.5" />
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => navigate(item.action!.to)}
                                                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--brand-primary)] hover:underline cursor-pointer"
                                                >
                                                    {item.action.label} <Icon className="w-3.5 h-3.5" />
                                                </button>
                                            ))}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className={cn(card, 'lg:col-span-4 p-5')}>
                    <h2 className="text-sm font-bold text-[#0F172A] flex items-center gap-2 mb-1">
                        <Target className="w-4 h-4 text-[var(--brand-primary)]" /> Opportunity Finder
                    </h2>
                    <p className="text-xs text-gray-500 mb-4">Keywords on the cusp of the Local Pack.</p>
                    {opportunities.length === 0 ? (
                        <p className="text-xs text-gray-400 py-4 text-center">No near-pack keywords yet.</p>
                    ) : (
                        <div className="space-y-3">
                            {opportunities.map((o) => {
                                const Icon = opportunityIcon(o.action.label);
                                return (
                                    <div key={o.keyword} className="rounded-lg border border-[#E2E8F0] p-3">
                                        <div className="flex items-center justify-between gap-2 mb-2">
                                            <span className="text-xs font-medium text-[#0F172A] truncate">{o.keyword}</span>
                                            <span className="text-[10px] font-semibold bg-[#F1F5F9] text-gray-600 px-1.5 py-0.5 rounded shrink-0">
                                                Rank {o.rank}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => navigate(o.action.to)}
                                            className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 border border-[#E2E8F0] rounded-md text-xs font-semibold text-[#0F172A] hover:bg-[#F8FAFC] cursor-pointer"
                                        >
                                            <Icon className="w-3.5 h-3.5" /> {o.action.label}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Keyword optimization health */}
            <div className={cn(card, 'overflow-hidden')}>
                <div className="flex items-start justify-between px-5 pt-5 pb-3 gap-3">
                    <div>
                        <h2 className="flex items-center gap-2 text-base font-bold text-[#0F172A]">
                            <BarChart3 className="w-5 h-5 text-[var(--brand-primary)] shrink-0" />
                            Keyword Optimization Health
                        </h2>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                            {trackedKeywords.length} scanned · {keywordRows.length - trackedKeywords.length} suggested from your services and city.
                        </p>
                    </div>
                    {keywordRows.length > 6 && (
                        <button
                            type="button"
                            onClick={() => setShowAllKeywords((v) => !v)}
                            className="text-xs font-semibold text-[var(--brand-primary)] hover:underline cursor-pointer shrink-0"
                        >
                            {showAllKeywords ? 'Show less' : `View All ${keywordRows.length} Keywords →`}
                        </button>
                    )}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className="text-gray-500 border-y border-[#E2E8F0]">
                                <th className="px-5 py-2.5 font-semibold">Keyword</th>
                                <th className="px-5 py-2.5 font-semibold">Local Rank</th>
                                <th className="px-5 py-2.5 font-semibold">Change</th>
                                <th className="px-5 py-2.5 font-semibold">Optimization Health</th>
                                <th className="px-5 py-2.5 font-semibold text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0]">
                            {visibleKeywords.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-5 py-8 text-center text-gray-400">
                                        No keywords tracked yet. Enter a keyword and run a scan.
                                    </td>
                                </tr>
                            )}
                            {visibleKeywords.map((k) => {
                                const hasPrev = typeof k.previousAvgRank === 'number' && k.previousAvgRank > 0;
                                const delta = hasPrev ? Number(((k.previousAvgRank as number) - k.avgRank).toFixed(1)) : 0;
                                const fallbackHealth = Math.round(
                                    (((21 - Math.min(21, k.avgRank || 21)) / 20) * 100) * 0.6 + (k.top3Percentage || 0) * 0.4
                                );
                                const health = Math.max(0, Math.min(100, Math.round(k.health || fallbackHealth)));
                                return (
                                    <tr
                                        key={k.keyword}
                                        className={cn(
                                            'hover:bg-[#F8FAFC]',
                                            keyword.toLowerCase() === k.keyword.toLowerCase() && 'bg-[#FFF8F1]'
                                        )}
                                    >
                                        <td className="px-5 py-3">
                                            <button
                                                type="button"
                                                onClick={() => loadKeyword(k)}
                                                className="font-medium text-[#0F172A] hover:underline cursor-pointer text-left"
                                            >
                                                {k.keyword}
                                            </button>
                                        </td>
                                        <td className="px-5 py-3 font-semibold text-[#0F172A]">{k.scanned ? Math.round(k.avgRank) || '—' : '—'}</td>
                                        <td className="px-5 py-3">
                                            {!k.scanned ? (
                                                <span className="text-gray-300">—</span>
                                            ) : delta > 0 ? (
                                                <span className="inline-flex items-center gap-0.5 font-semibold text-emerald-600">
                                                    <ArrowUp className="w-3 h-3" /> {delta}
                                                </span>
                                            ) : delta < 0 ? (
                                                <span className="inline-flex items-center gap-0.5 font-semibold text-red-600">
                                                    <ArrowDown className="w-3 h-3" /> {Math.abs(delta)}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-0.5 text-gray-400">
                                                    <Minus className="w-3 h-3" /> 0
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3">
                                            {!k.scanned ? (
                                                <span className="text-[11px] text-gray-400">Not scanned yet</span>
                                            ) : (
                                            <div className="flex items-center gap-3 min-w-[160px]">
                                                <div className="flex-1 h-1.5 bg-[#F1F5F9] rounded-full overflow-hidden">
                                                    <div className={cn('h-full rounded-full', healthTone(health))} style={{ width: `${health}%` }} />
                                                </div>
                                                <span className="text-[11px] font-medium text-gray-600 w-12 text-right">{health}/100</span>
                                            </div>
                                            )}
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            {!k.scanned ? (
                                                <button
                                                    type="button"
                                                    disabled={scanning}
                                                    onClick={() => scanKeyword(k.keyword)}
                                                    className="text-xs font-semibold text-[var(--brand-primary)] hover:underline cursor-pointer disabled:opacity-50"
                                                >
                                                    Scan
                                                </button>
                                            ) : health >= 80 ? (
                                                <MoreVertical className="inline w-4 h-4 text-gray-300" />
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => navigate('/posts')}
                                                    className="text-xs font-semibold text-[var(--brand-primary)] hover:underline cursor-pointer inline-flex items-center gap-1"
                                                >
                                                    <TrendingUp className="w-3 h-3" /> Optimize
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            <span className="sr-only">
                <Users />
            </span>
        </div>
    );
}
