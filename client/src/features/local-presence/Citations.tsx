import { useEffect, useState } from 'react';
import {
    BadgeCheck,
    CheckCircle2,
    AlertTriangle,
    AlertCircle,
    Layers,
    BarChart3,
    PieChart,
    Trophy,
    TrendingUp,
    Database,
    BookMarked,
    Loader2,
    ArrowUp,
    ArrowDown,
    ExternalLink,
    ShieldCheck,
    Lightbulb,
    Star,
    Sparkles,
    ArrowRight,
    X,
    Clock
} from 'lucide-react';
import { apiDelete, apiGet, apiPost, logDashboardActivity } from '../../shared/utils';
import { HistoryButton, HistoryModal, ViewingOldBanner, historyDate } from '../../shared/HistoryPanel';
import { getPageCache, setPageCache } from '../../shared/pageCache';
import { useCredits } from '../../shared/CreditsContext';
import { InfoTip } from '../../shared/InfoTip';
import { Donut, Sparkline, TrendChart } from './CitationCharts';

// Website of each directory, used for its logo. Covers BrightLocal and DataForSEO labels.
const DIRECTORY_DOMAINS: Record<string, string> = {
    google: 'google.com',
    'bing places': 'bing.com',
    'apple maps': 'apple.com',
    facebook: 'facebook.com',
    yelp: 'yelp.com',
    yell: 'yell.com',
    'thomson local': 'thomsonlocal.com',
    '192.com': '192.com',
    '192.com (central index)': '192.com',
    tripadvisor: 'tripadvisor.co.uk',
    trustpilot: 'trustpilot.com',
    foursquare: 'foursquare.com',
    nextdoor: 'nextdoor.co.uk',
    tomtom: 'tomtom.com',
    here: 'here.com',
    scoot: 'scoot.co.uk',
    freeindex: 'freeindex.co.uk',
    hotfrog: 'hotfrog.co.uk',
    brownbook: 'brownbook.net',
    touchlocal: 'touchlocal.com',
    cybo: 'cybo.com',
    'business magnet': 'businessmagnet.co.uk',
    'uk small business directory': 'uksmallbusinessdirectory.co.uk',
    'the trade finder': 'thetradefinder.co.uk',
    misterwhat: 'misterwhat.co.uk',
    opendi: 'opendi.co.uk',
    fyple: 'fyple.co.uk',
    storeboard: 'storeboard.com',
    tupalo: 'tupalo.co',
    zipleaf: 'zipleaf.co.uk',
    checkatrade: 'checkatrade.com',
    bark: 'bark.com',
    cylex: 'cylex-uk.co.uk',
    bbb: 'bbb.org',
    'yellow pages': 'yellowpages.com'
};

// The directories customers and Google lean on most. Missing ones are flagged first.
const KEY_DIRECTORIES = ['Google', 'Apple Maps', 'Bing Places', 'Facebook', 'Yelp'];

type Filter = 'all' | 'found' | 'mismatch' | 'missing' | 'unclaimed';

// Groups for the "Citation sources" donut, in fixed colour order. Anything else counts as a directory.
const SOURCE_GROUPS = [
    { id: 'maps', label: 'Maps and search', color: '#2a78d6', names: ['Google', 'Bing Places', 'Apple Maps', 'TomTom', 'HERE'] },
    { id: 'social', label: 'Social and reviews', color: '#eb6834', names: ['Facebook', 'Yelp', 'TripAdvisor', 'Trustpilot', 'Foursquare', 'Nextdoor'] },
    { id: 'directories', label: 'Online directories', color: '#1baf7a', names: [] as string[] }
];

function sourceGroupOf(directory: string) {
    return SOURCE_GROUPS.find((g) => g.names.includes(directory))?.id || 'directories';
}


function directoryDomain(row: any) {
    const known = DIRECTORY_DOMAINS[String(row?.directory || '').toLowerCase()];
    if (known) return known;
    try {
        return new URL(String(row?.url || '')).hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
}

function DirectoryLogo({ row, size = 'md' }: { row: any; size?: 'sm' | 'md' }) {
    const domain = directoryDomain(row);
    const [failed, setFailed] = useState(false);
    const letter = String(row?.directory || '?').charAt(0).toUpperCase();
    return (
        <div
            className={`${size === 'sm' ? 'w-6 h-6 rounded-md' : 'w-9 h-9 rounded-xl'} bg-white border border-[#E2E8F0] flex items-center justify-center shrink-0 overflow-hidden`}
        >
            {domain && !failed ? (
                <img
                    src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
                    alt=""
                    className={`${size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'} object-contain`}
                    loading="lazy"
                    onError={() => setFailed(true)}
                />
            ) : (
                <span className="text-sm font-bold text-slate-500">{letter}</span>
            )}
        </div>
    );
}

function countRows(run: any) {
    const rows = Array.isArray(run?.citations) ? run.citations : [];
    return {
        total: rows.length,
        found: rows.filter((r: any) => r.status === 'found').length,
        mismatch: rows.filter((r: any) => r.status === 'mismatch').length,
        missing: rows.filter((r: any) => r.status === 'missing').length
    };
}

export default function Citations() {
    const cached = getPageCache<{ result: any; history: any[] }>('citations');
    const { refresh: refreshCredits } = useCredits();
    const [loading, setLoading] = useState(false);
    const [ready, setReady] = useState(Boolean(cached));
    const [error, setError] = useState('');
    const [result, setResult] = useState<any>(cached?.result ?? null);
    const [history, setHistory] = useState<any[]>(cached?.history ?? []);
    const [showHistory, setShowHistory] = useState(false);
    const [filter, setFilter] = useState<Filter>('all');
    const [listOpen, setListOpen] = useState(false);

    useEffect(() => {
        if (!listOpen) return;
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setListOpen(false);
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [listOpen]);
    const [trendMetric, setTrendMetric] = useState<'listed' | 'healthy' | 'missing'>('listed');

    useEffect(() => {
        if (ready) setPageCache('citations', { result, history });
    }, [ready, result, history]);

    const applyPayload = (data: any) => {
        const runs = Array.isArray(data?.history) ? data.history : [];
        setHistory(runs);
        const latest = data?.scannedAt ? data : runs[0];
        if (latest?.scannedAt) setResult(latest);
    };

    useEffect(() => {
        apiGet('/api/ai/citations')
            .then(applyPayload)
            .catch(() => {})
            .finally(() => setReady(true));
    }, []);

    const runAudit = async () => {
        setLoading(true);
        setError('');
        const started = Date.now();
        try {
            // BrightLocal checks each directory separately; Google can take about two minutes.
            while (Date.now() - started < 240000) {
                const data = await apiPost('/api/ai/citations', {});
                if (data?.retry) {
                    const seconds = Math.min(8, Math.max(3, Number(data.retryAfterSeconds) || 4));
                    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
                    continue;
                }
                applyPayload(data);
                setFilter('all');
                await logDashboardActivity({
                    type: 'citations',
                    message: `Citation audit complete. ${data.found || 0} found, ${data.missing || 0} missing.`,
                    icon: 'Activity',
                    color: 'text-[#0F172A]'
                });
                return;
            }
            setError('The directory check is still running. Run it again in a little while.');
        } catch (err: any) {
            setError(err?.message || 'Citation search did not finish. Run it again.');
        } finally {
            setLoading(false);
            refreshCredits();
        }
    };

    const deleteScan = async (scannedAt: string) => {
        if (!window.confirm('Delete this scan? This cannot be undone.')) return;
        try {
            const data = await apiDelete(`/api/ai/citations/history?scannedAt=${encodeURIComponent(scannedAt)}`);
            const runs = Array.isArray(data?.history) ? data.history : [];
            setHistory(runs);
            // Keep an older scan open unless it was the one deleted.
            if (!result?.scannedAt || result.scannedAt === scannedAt) setResult(data?.scannedAt ? data : runs[0] || null);
        } catch (e: any) {
            setError(e?.message || 'Could not delete the scan');
        }
    };


    const latestId = history[0]?.scannedAt;
    const viewingOld = Boolean(result?.scannedAt && latestId && result.scannedAt !== latestId);

    const rows: any[] = Array.isArray(result?.citations) ? result.citations : [];
    const counts = countRows(result);
    const hasScan = rows.length > 0;
    const listedCount = counts.found + counts.mismatch;
    const healthScore = counts.total ? Math.round((counts.found / counts.total) * 100) : 0;
    const keyListed = KEY_DIRECTORIES.filter((name) => rows.some((r) => r.directory === name && r.status !== 'missing')).length;

    // Scans up to the one on screen, oldest first, for the trend and sparklines.
    const shownIndex = history.findIndex((run) => run?.scannedAt === result?.scannedAt);
    const scansUpToShown = (shownIndex >= 0 ? history.slice(shownIndex) : result?.scannedAt ? [result] : [])
        .filter((run) => run?.scannedAt && Array.isArray(run.citations))
        .slice(0, 12)
        .reverse();
    const series = scansUpToShown.map((run) => {
        const c = countRows(run);
        const runRows: any[] = run.citations;
        return {
            label: new Date(run.scannedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
            listed: c.found + c.mismatch,
            healthy: c.total ? Math.round((c.found / c.total) * 100) : 0,
            missing: c.missing,
            key: KEY_DIRECTORIES.filter((name) => runRows.some((r) => r.directory === name && r.status !== 'missing')).length
        };
    });
    const previous = series.length > 1 ? series[series.length - 2] : null;

    const lastScanLabel = result?.scannedAt
        ? new Date(result.scannedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        : '';

    const missingKey = KEY_DIRECTORIES.filter((name) => rows.some((r) => r.directory === name && r.status === 'missing'));
    const mismatched = rows.filter((r) => r.status === 'mismatch');
    const unclaimed = rows.filter((r) => r.status !== 'missing' && r.claimed === false);
    const otherMissing = rows.filter((r) => r.status === 'missing' && !KEY_DIRECTORIES.includes(r.directory));

    const fixes: Array<{ tone: 'red' | 'amber' | 'blue'; title: string; body: string; filter: Filter }> = [];
    if (missingKey.length) {
        fixes.push({
            tone: 'red',
            title: `Get listed on ${missingKey.length} key ${missingKey.length === 1 ? 'directory' : 'directories'}`,
            body: `Missing from ${missingKey.join(', ')}. Customers and Google check these most.`,
            filter: 'missing'
        });
    }
    if (mismatched.length) {
        fixes.push({
            tone: 'amber',
            title: `Fix details on ${mismatched.length} ${mismatched.length === 1 ? 'listing' : 'listings'}`,
            body: `${mismatched.slice(0, 3).map((r) => r.directory).join(', ')}${mismatched.length > 3 ? ' and others' : ''} ${mismatched.length === 1 ? 'shows' : 'show'} a different name, address or phone.`,
            filter: 'mismatch'
        });
    }
    if (unclaimed.length) {
        fixes.push({
            tone: 'amber',
            title: `Claim ${unclaimed.length} ${unclaimed.length === 1 ? 'listing' : 'listings'}`,
            body: `${unclaimed.slice(0, 3).map((r) => r.directory).join(', ')}${unclaimed.length > 3 ? ' and others' : ''}: nobody has claimed ${unclaimed.length === 1 ? 'this listing' : 'these listings'} yet.`,
            filter: 'unclaimed'
        });
    }
    if (otherMissing.length) {
        fixes.push({
            tone: 'blue',
            title: `Add ${otherMissing.length} more ${otherMissing.length === 1 ? 'directory' : 'directories'}`,
            body: `Listings on ${otherMissing.slice(0, 3).map((r) => r.directory).join(', ')}${otherMissing.length > 3 ? ' and others' : ''} help Google trust your details.`,
            filter: 'missing'
        });
    }

    const filteredRows =
        filter === 'all'
            ? rows
            : filter === 'unclaimed'
              ? unclaimed
              : rows.filter((r) => r.status === filter);

    const chooseFilter = (next: Filter) => setFilter(next);

    const openList = (next: Filter) => {
        setFilter(next);
        setListOpen(true);
    };

    const exportCsv = () => {
        const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const statusLabel: Record<string, string> = { found: 'Listed', mismatch: 'Wrong details', missing: 'Missing' };
        const lines = [
            ['Citation scan', lastScanLabel].map(esc).join(','),
            ['Directories checked', counts.total, 'Listed', counts.found, 'Wrong details', counts.mismatch, 'Missing', counts.missing, 'Health', `${healthScore}%`].map(esc).join(','),
            '',
            ['Directory', 'Status', 'Business name', 'Address', 'Phone', 'Claimed', 'Rating', 'Reviews', 'Note', 'Listing URL'].map(esc).join(','),
            ...rows.map((r) =>
                [
                    r.directory,
                    statusLabel[r.status] || r.status,
                    r.businessName,
                    r.address,
                    r.phone,
                    r.claimed === true ? 'Yes' : r.claimed === false ? 'No' : '',
                    r.rating ?? '',
                    r.reviewCount ?? '',
                    r.status === 'missing' ? '' : r.note,
                    r.url
                ]
                    .map(esc)
                    .join(',')
            )
        ];
        const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `citations-${String(result?.scannedAt || new Date().toISOString()).slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const delta = (now: number, before: number | undefined, goodWhenUp: boolean, unit = '') => {
        if (before == null) return <span className="text-[11px] text-gray-400">First scan</span>;
        const diff = now - before;
        if (diff === 0) return <span className="text-[11px] text-gray-400">No change since last scan</span>;
        const good = goodWhenUp ? diff > 0 : diff < 0;
        return (
            <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${good ? 'text-emerald-600' : 'text-red-500'}`}>
                {diff > 0 ? <ArrowUp className="w-3 h-3" strokeWidth={3} /> : <ArrowDown className="w-3 h-3" strokeWidth={3} />}
                {diff > 0 ? '+' : '-'}
                {Math.abs(diff)}
                {unit} since last scan
            </span>
        );
    };

    const statCards = [
        {
            label: 'Total citations',
            value: String(listedCount),
            icon: <Layers className="w-5 h-5 text-blue-600" />,
            iconBg: 'bg-blue-50',
            color: '#2a78d6',
            spark: series.map((s) => s.listed),
            change: delta(listedCount, previous?.listed, true),
            info: ['Directories where we found a listing for your business, with correct or wrong details.', `Out of ${counts.total} directories checked.`]
        },
        {
            label: 'Healthy listings',
            value: `${healthScore}%`,
            icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />,
            iconBg: 'bg-emerald-50',
            color: '#10B981',
            spark: series.map((s) => s.healthy),
            change: delta(healthScore, previous?.healthy, true, '%'),
            info: ['The share of checked directories where your business is listed with the right name, address and phone.']
        },
        {
            label: 'Missing citations',
            value: String(counts.missing),
            icon: <AlertCircle className="w-5 h-5 text-amber-500" />,
            iconBg: 'bg-amber-50',
            color: '#F59E0B',
            spark: series.map((s) => s.missing),
            change: delta(counts.missing, previous?.missing, false),
            info: ['Directories where no listing for your business was found.', 'Adding your business to these sites gives customers more ways to find you.']
        },
        {
            label: 'Key directories',
            value: `${keyListed}/${KEY_DIRECTORIES.length}`,
            icon: <Star className="w-5 h-5 text-violet-500" />,
            iconBg: 'bg-violet-50',
            color: '#8B5CF6',
            spark: series.map((s) => s.key),
            change: delta(keyListed, previous?.key, true),
            info: [`How many of the key directories list your business: ${KEY_DIRECTORIES.join(', ')}.`]
        }
    ];

    const trendOptions: Array<{ id: 'listed' | 'healthy' | 'missing'; label: string; max: number; suffix: string }> = [
        { id: 'listed', label: 'Total citations', max: counts.total, suffix: '' },
        { id: 'healthy', label: 'Healthy listings', max: 100, suffix: '%' },
        { id: 'missing', label: 'Missing', max: counts.total, suffix: '' }
    ];
    const trendOption = trendOptions.find((o) => o.id === trendMetric) || trendOptions[0];
    const trendPoints = series.map((s) => ({ label: s.label, value: s[trendOption.id] }));

    const sourceSlices = SOURCE_GROUPS.map((group) => ({
        label: group.label,
        color: group.color,
        value: rows.filter((r) => r.status !== 'missing' && sourceGroupOf(r.directory) === group.id).length
    }));

    // Most recent scan (on or before the one on screen) where each key directory had a listing.
    const lastFound = (name: string) => {
        const runs = shownIndex >= 0 ? history.slice(shownIndex) : [result];
        const hit = runs.find((run: any) => (run?.citations || []).some((r: any) => r.directory === name && r.status !== 'missing'));
        return hit?.scannedAt ? new Date(hit.scannedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    };

    const statusBadge = (status: string) => {
        if (status === 'found') {
            return (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Listed
                </span>
            );
        }
        if (status === 'mismatch') {
            return (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Wrong details
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-500">
                <AlertCircle className="w-3.5 h-3.5" />
                Missing
            </span>
        );
    };

    const toneStyles = {
        red: { box: 'bg-red-50', icon: <AlertTriangle className="w-4 h-4 text-red-500" /> },
        amber: { box: 'bg-amber-50', icon: <TrendingUp className="w-4 h-4 text-amber-500" /> },
        blue: { box: 'bg-blue-50', icon: <Lightbulb className="w-4 h-4 text-blue-500" /> }
    };

    const healthChecks = [
        { ok: counts.mismatch === 0, label: counts.mismatch === 0 ? 'NAP consistency' : `${counts.mismatch} listing${counts.mismatch === 1 ? '' : 's'} with wrong details` },
        { ok: missingKey.length === 0, label: missingKey.length === 0 ? 'On all key directories' : 'Some key directories missing' },
        { ok: unclaimed.length === 0, label: unclaimed.length === 0 ? 'No unclaimed listings' : `${unclaimed.length} unclaimed listing${unclaimed.length === 1 ? '' : 's'}` },
        { ok: listedCount >= counts.total / 2, label: listedCount >= counts.total / 2 ? 'Active on most directories' : 'Listed on under half the directories' }
    ];

    const healthStroke = healthScore >= 70 ? '#10B981' : healthScore >= 40 ? '#F59E0B' : '#EF4444';
    const healthText = healthScore >= 70 ? 'text-emerald-600' : healthScore >= 40 ? 'text-amber-600' : 'text-red-600';
    const healthLabel = healthScore >= 70 ? 'Healthy' : healthScore >= 40 ? 'Needs work' : 'Poor';
    const ringRadius = 50;
    const ringLength = 2 * Math.PI * ringRadius;

    const filters: Array<{ id: Filter; label: string; count: number }> = [
        { id: 'all', label: 'All', count: counts.total },
        { id: 'found', label: 'Listed', count: counts.found },
        { id: 'mismatch', label: 'Wrong details', count: counts.mismatch },
        { id: 'missing', label: 'Missing', count: counts.missing },
        ...(unclaimed.length ? [{ id: 'unclaimed' as Filter, label: 'Not claimed', count: unclaimed.length }] : [])
    ];

    const card = 'bg-white rounded-2xl border border-[#E2E8F0] shadow-sm';

    return (
        <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-12">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#0F172A]">Citations</h1>
                    <p className="text-gray-500 text-xs md:text-sm mt-1">
                        Track your business listings across Google, Apple Maps, Bing, Facebook, Yelp and other UK directories.
                    </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {lastScanLabel ? (
                        <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] text-gray-500 bg-white border border-[#E2E8F0] rounded-xl px-3 py-2.5">
                            <Clock className="w-3.5 h-3.5" />
                            {lastScanLabel}
                        </span>
                    ) : null}
                    <HistoryButton count={history.filter((run) => run?.scannedAt).length} onClick={() => setShowHistory(true)} />
                    <button
                        type="button"
                        onClick={exportCsv}
                        disabled={!hasScan || loading}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-[#E2E8F0] hover:border-slate-300 text-[#0F172A] rounded-xl text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-xs cursor-pointer"
                    >
                        <ExternalLink className="w-4 h-4" />
                        Export
                    </button>
                    <button
                        type="button"
                        onClick={runAudit}
                        disabled={loading}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-foreground)] rounded-xl text-xs font-bold transition-colors disabled:opacity-70 shadow-sm cursor-pointer"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BadgeCheck className="w-4 h-4" />}
                        {loading ? 'Scanning...' : 'Run citation audit'}
                    </button>
                </div>
            </div>

            {viewingOld && (
                <div className="mb-6">
                    <ViewingOldBanner date={historyDate(result.scannedAt)} onBack={() => setResult(history[0])} />
                </div>
            )}

            {error && (
                <p className="mb-6 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">
                    {error}
                </p>
            )}

            {!ready ? (
                <div className="flex justify-center py-24">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
            ) : loading ? (
                <div className={`${card} p-14 text-center`}>
                    <div className="w-14 h-14 border-4 border-slate-100 border-t-[var(--brand-primary)] rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-base font-bold text-[#0F172A]">Scanning citations and directories...</p>
                    <p className="text-xs text-gray-500 mt-1.5">Checking Google, Apple Maps, Bing, Facebook, Yelp and other UK directories. This can take up to 3 minutes.</p>
                </div>
            ) : !hasScan ? (
                <div className="bg-white rounded-2xl border border-dashed border-[#CBD5E1] p-10 md:p-16 flex flex-col items-center justify-center text-center shadow-sm">
                    <div className="w-14 h-14 rounded-2xl bg-[var(--brand-primary)]/10 flex items-center justify-center mb-4">
                        <BookMarked className="w-7 h-7 text-[var(--brand-primary)]" />
                    </div>
                    <h2 className="text-xl font-bold text-[#0F172A] mb-1.5">No citation scan yet</h2>
                    <p className="text-sm text-gray-500 max-w-md mb-6 leading-relaxed">
                        Add your business details, then scan Google, Apple Maps, Bing, Facebook, Yelp and other UK directories.
                    </p>
                    <button
                        type="button"
                        onClick={runAudit}
                        className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-foreground)] rounded-xl text-xs font-bold shadow-sm cursor-pointer transition-colors"
                    >
                        <BadgeCheck className="w-4 h-4" />
                        Run first audit
                    </button>
                </div>
            ) : (
                <>
                    {/* Stat cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
                        {statCards.map((s) => (
                            <div key={s.label} className={`${card} p-4`}>
                                <div className="flex items-start gap-3">
                                    <div className={`w-10 h-10 rounded-full ${s.iconBg} flex items-center justify-center shrink-0`}>{s.icon}</div>
                                    <div className="min-w-0 flex-1">
                                        <p className="flex items-center gap-1 text-xs font-semibold text-[#0F172A]">
                                            {s.label} <InfoTip info={{ title: s.label, body: s.info }} />
                                        </p>
                                        <div className="flex items-end justify-between gap-2">
                                            <p className="text-2xl font-bold text-[#0F172A] mt-0.5">{s.value}</p>
                                            <Sparkline values={s.spark} color={s.color} />
                                        </div>
                                        <div className="min-h-[16px]">{s.change}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Trend + sources */}
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-5">
                        <div className={`${card} p-5 lg:col-span-3`}>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                                <div className="flex items-center gap-2">
                                    <BarChart3 className="w-5 h-5 text-[var(--brand-primary)]" />
                                    <h2 className="text-sm font-bold text-[#0F172A]">Citations trend</h2>
                                    <InfoTip info={{ title: 'Citations trend', body: ['One point per citation scan. Hover a point to see its value.', 'Run a new scan after fixing listings to see the change here.'] }} />
                                </div>
                                <div className="flex gap-1 bg-slate-100/70 rounded-xl p-1">
                                    {trendOptions.map((o) => (
                                        <button
                                            key={o.id}
                                            type="button"
                                            onClick={() => setTrendMetric(o.id)}
                                            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                                                trendMetric === o.id ? 'bg-white text-[var(--brand-primary)] shadow-sm' : 'text-gray-500 hover:text-[#0F172A]'
                                            }`}
                                        >
                                            {o.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <TrendChart points={trendPoints} max={trendOption.max} suffix={trendOption.suffix} name={trendOption.label} />
                            {series.length < 2 && (
                                <p className="text-[11px] text-gray-400 text-center -mt-1">Run more scans to see how your citations change over time.</p>
                            )}
                        </div>

                        <div className={`${card} p-5 lg:col-span-2`}>
                            <div className="flex items-center gap-2 mb-4">
                                <PieChart className="w-5 h-5 text-[var(--brand-primary)]" />
                                <h2 className="text-sm font-bold text-[#0F172A]">Citation sources</h2>
                                <InfoTip info={{ title: 'Citation sources', body: ['Where your listings were found in this scan, grouped by type of site.'] }} />
                            </div>
                            <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center gap-5">
                                <Donut slices={sourceSlices} total={listedCount} />
                                <ul className="flex-1 w-full space-y-3">
                                    {sourceSlices.map((s) => (
                                        <li key={s.label} className="flex items-start justify-between gap-3">
                                            <div className="flex items-start gap-2">
                                                <span className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ background: s.color }} />
                                                <div>
                                                    <p className="text-xs font-medium text-[#0F172A]">{s.label}</p>
                                                    <p className="text-[11px] text-gray-400">({s.value})</p>
                                                </div>
                                            </div>
                                            <span className="text-xs font-bold text-[#0F172A]">
                                                {listedCount ? Math.round((s.value / listedCount) * 100) : 0}%
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Top directories, health, recommendations */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
                        <div className={`${card} p-5`}>
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Trophy className="w-5 h-5 text-amber-500" />
                                    <h2 className="text-sm font-bold text-[#0F172A]">Top directories</h2>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => openList('all')}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--brand-primary)]/10 text-[11px] font-bold text-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/15 cursor-pointer"
                                >
                                    View all <ArrowRight className="w-3 h-3" />
                                </button>
                            </div>
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="text-[11px] text-gray-500 bg-slate-50">
                                        <th className="text-left font-medium px-2 py-2 rounded-l-lg">Directory</th>
                                        <th className="text-left font-medium px-2 py-2">Status</th>
                                        <th className="text-left font-medium px-2 py-2 rounded-r-lg">Last found</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {KEY_DIRECTORIES.map((name) => {
                                        const row = rows.find((r) => r.directory === name) || { directory: name, status: 'missing' };
                                        const when = lastFound(name);
                                        return (
                                            <tr key={name} className="border-b border-slate-50 last:border-0">
                                                <td className="px-2 py-2.5">
                                                    <div className="flex items-center gap-2">
                                                        <DirectoryLogo row={row} size="sm" />
                                                        <span className="font-medium text-[#0F172A]">{name}</span>
                                                    </div>
                                                </td>
                                                <td className="px-2 py-2.5">{statusBadge(row.status)}</td>
                                                <td className="px-2 py-2.5 text-gray-500">{when || '-'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className={`${card} p-5 flex flex-col`}>
                            <div className="flex items-center gap-2 mb-4">
                                <ShieldCheck className="w-5 h-5 text-emerald-500" />
                                <h2 className="text-sm font-bold text-[#0F172A]">Citation health</h2>
                                <InfoTip info={{ title: 'Citation health', body: ['The share of checked directories where your business is listed with the right details.', 'Fix wrong details and add missing listings to raise it.'] }} />
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="relative w-28 h-28 shrink-0">
                                    <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                                        <circle cx="60" cy="60" r={ringRadius} fill="none" stroke="#ECFDF5" strokeWidth="12" />
                                        <circle
                                            cx="60"
                                            cy="60"
                                            r={ringRadius}
                                            fill="none"
                                            stroke={healthStroke}
                                            strokeWidth="12"
                                            strokeLinecap="round"
                                            strokeDasharray={ringLength}
                                            strokeDashoffset={ringLength * (1 - healthScore / 100)}
                                            className="transition-all duration-700"
                                        />
                                    </svg>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <span className="text-2xl font-bold text-[#0F172A]">{healthScore}%</span>
                                        <span className={`text-[11px] font-semibold ${healthText}`}>{healthLabel}</span>
                                    </div>
                                </div>
                                <ul className="space-y-2.5 min-w-0">
                                    {healthChecks.map((check) => (
                                        <li key={check.label} className="flex items-start gap-2 text-[11px] text-gray-700 leading-snug">
                                            {check.ok ? (
                                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                            ) : (
                                                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                                            )}
                                            {check.label}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        <div className={`${card} p-5`}>
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Sparkles className="w-5 h-5 text-[var(--brand-primary)]" />
                                    <h2 className="text-sm font-bold text-[#0F172A]">Recommendations</h2>
                                </div>
                                {fixes.some((f) => f.tone === 'red') ? (
                                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">High priority</span>
                                ) : null}
                            </div>
                            {fixes.length ? (
                                <ul className="divide-y divide-slate-100">
                                    {fixes.slice(0, 3).map((fix) => (
                                        <li key={fix.title} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                                            <div className={`w-8 h-8 rounded-lg ${toneStyles[fix.tone].box} flex items-center justify-center shrink-0`}>
                                                {toneStyles[fix.tone].icon}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold text-[#0F172A]">{fix.title}</p>
                                                <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{fix.body}</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => openList(fix.filter)}
                                                className="shrink-0 px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] text-[11px] font-semibold text-[var(--brand-primary)] hover:border-[var(--brand-primary)]/40 cursor-pointer"
                                            >
                                                View details
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2.5">
                                    <CheckCircle2 className="w-4 h-4" />
                                    Nothing to fix. Your listings are complete and correct.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Full directory list, opened from "View all" and "View details" */}
                    {listOpen && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40" onClick={() => setListOpen(false)}>
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label="All directory listings"
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
                    >
                        <div className="px-5 py-4 border-b border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <Database className="w-5 h-5 text-[var(--brand-primary)]" />
                                <h2 className="text-sm font-bold text-[#0F172A]">All directory listings</h2>
                                <InfoTip info={{ title: 'All directory listings', body: ['One row per directory, with the name, address and phone found on that site.', 'Listed = details match. Wrong details = listing found but details differ. Missing = no listing found, so consider adding one.', 'Not claimed means the listing exists but nobody has taken ownership of it. Claim it so you can keep the details correct.'] }} />
                            </div>
                            <div className="flex items-center gap-2">
                            <div className="flex flex-wrap gap-1 bg-slate-100/70 rounded-xl p-1">
                                {filters.map((f) => (
                                    <button
                                        key={f.id}
                                        type="button"
                                        onClick={() => chooseFilter(f.id)}
                                        className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                                            filter === f.id ? 'bg-white text-[var(--brand-primary)] shadow-sm' : 'text-gray-500 hover:text-[#0F172A]'
                                        }`}
                                    >
                                        {f.label}
                                        <span className="ml-1.5 text-[10px] text-gray-400">{f.count}</span>
                                    </button>
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={() => setListOpen(false)}
                                aria-label="Close"
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-slate-100 cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                            </div>
                        </div>

                        <ul className="divide-y divide-[#F1F5F9] overflow-y-auto">
                            {filteredRows.map((row: any, i: number) => (
                                <li key={`${row.directory}-${i}`} className="px-5 py-3.5 flex flex-col md:flex-row md:items-center gap-3 hover:bg-slate-50/60 transition-colors">
                                    <div className="flex items-center gap-3 md:w-60 shrink-0">
                                        <DirectoryLogo row={row} />
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-[#0F172A] truncate">{row.directory}</p>
                                            {row.status !== 'missing' && (row.claimed != null || row.rating) ? (
                                                <p className="flex items-center gap-1 text-[11px] text-gray-500">
                                                    {row.claimed === true ? 'Claimed' : row.claimed === false ? <span className="text-amber-600 font-medium">Not claimed</span> : null}
                                                    {row.claimed != null && row.rating ? <span>·</span> : null}
                                                    {row.rating ? (
                                                        <span className="inline-flex items-center gap-0.5">
                                                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                                            {Number(row.rating).toFixed(1)}
                                                            {row.reviewCount ? ` (${Number(row.reviewCount).toLocaleString('en-GB')})` : ''}
                                                        </span>
                                                    ) : null}
                                                </p>
                                            ) : null}
                                        </div>
                                    </div>

                                    <div className="flex-1 min-w-0 text-xs">
                                        {row.status === 'missing' ? (
                                            <p className="text-gray-400">No listing found on this directory</p>
                                        ) : (
                                            <>
                                                <p className="font-semibold text-gray-800 truncate">{row.businessName || 'Name not shown'}</p>
                                                <p className="text-gray-500 truncate mt-0.5">
                                                    {[row.address, row.phone].filter(Boolean).join(' · ') || 'Address and phone not shown'}
                                                </p>
                                                {row.status === 'mismatch' && row.note ? <p className="text-[11px] text-amber-700 mt-0.5">{row.note}</p> : null}
                                            </>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-3 md:justify-end md:w-44 shrink-0">
                                        {statusBadge(row.status)}
                                        {row.url ? (
                                            <a
                                                href={row.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                title="Open listing"
                                                className="w-8 h-8 rounded-lg border border-[#E2E8F0] flex items-center justify-center text-gray-500 hover:text-[var(--brand-primary)] hover:border-[var(--brand-primary)]/40 transition-colors"
                                            >
                                                <ExternalLink className="w-3.5 h-3.5" />
                                            </a>
                                        ) : (
                                            <span className="w-8 h-8" />
                                        )}
                                    </div>
                                </li>
                            ))}
                            {!filteredRows.length && (
                                <li className="px-6 py-10 text-center text-xs text-gray-400">No directories in this group.</li>
                            )}
                        </ul>
                    </div>
                        </div>
                    )}
                </>
            )}

            <HistoryModal
                open={showHistory}
                title="Citation scan history"
                rows={history
                    .filter((run) => run?.scannedAt)
                    .map((run, i, list) => {
                        const prev = list[i + 1];
                        const change = prev ? (Number(run.found) || 0) - (Number(prev.found) || 0) : null;
                        const c = countRows(run);
                        return {
                            id: run.scannedAt,
                            date: historyDate(run.scannedAt),
                            summary: (
                                <span className="flex flex-wrap gap-x-3">
                                    <span className="text-emerald-700">{c.found} listed</span>
                                    <span className="text-amber-700">{c.mismatch} wrong details</span>
                                    <span className="text-red-700">{c.missing} missing</span>
                                </span>
                            ),
                            change:
                                change == null ? (
                                    <span className="text-[11px] text-gray-400">First scan</span>
                                ) : change === 0 ? (
                                    <span className="text-[11px] text-gray-400">No change</span>
                                ) : (
                                    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${change > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                        {change > 0 ? <ArrowUp className="w-3 h-3" strokeWidth={3} /> : <ArrowDown className="w-3 h-3" strokeWidth={3} />}
                                        {Math.abs(change)} listed
                                    </span>
                                )
                        };
                    })}
                viewingId={result?.scannedAt}
                latestId={latestId}
                onView={(id) => {
                    const run = history.find((h) => h.scannedAt === id);
                    if (run) setResult(run);
                }}
                onDelete={deleteScan}
                onClose={() => setShowHistory(false)}
            />
        </div>
    );
}
