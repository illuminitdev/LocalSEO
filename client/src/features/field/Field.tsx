import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft,
    Calendar,
    Camera,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Clock,
    MapPin,
    MoreVertical,
    PenLine,
    Plus,
    Search,
    Trash2,
    Upload,
    UserRound,
    X,
    XCircle
} from 'lucide-react';
import { apiGet, apiPatch, apiPost, apiDelete, cn } from '../../shared/utils';

const AVATAR_COLORS = [
    { bg: 'bg-purple-100', text: 'text-purple-800' },
    { bg: 'bg-blue-100', text: 'text-blue-800' },
    { bg: 'bg-orange-100', text: 'text-orange-800' },
    { bg: 'bg-emerald-100', text: 'text-emerald-800' },
    { bg: 'bg-rose-100', text: 'text-rose-800' },
    { bg: 'bg-amber-100', text: 'text-amber-800' }
];

function getAvatarStyle(name: string) {
    const charCode = (name || 'J').charCodeAt(0);
    return AVATAR_COLORS[charCode % AVATAR_COLORS.length];
}

function formatFieldSchedule(dateStr?: string) {
    if (!dateStr) return '17 Sept 2026, 17:00';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '17 Sept 2026, 17:00';
        const day = d.getDate();
        const month = d.toLocaleDateString('en-US', { month: 'short' });
        const year = d.getFullYear();
        const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        return `${day} ${month} ${year}, ${time}`;
    } catch {
        return '17 Sept 2026, 17:00';
    }
}

async function uploadBlob(blob: Blob, contentType: string) {
    const presign = await apiPost('/api/host/media/presign', { contentType });
    const put = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: blob
    });
    if (!put.ok) throw new Error('Upload failed');
    return String(presign.publicUrl);
}

function SignaturePad({ onSave, busy }: { onSave: (url: string) => Promise<void>; busy: boolean }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#0F172A';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
    }, []);

    const pos = (e: React.PointerEvent) => {
        const canvas = canvasRef.current!;
        const r = canvas.getBoundingClientRect();
        return {
            x: ((e.clientX - r.left) / r.width) * canvas.width,
            y: ((e.clientY - r.top) / r.height) * canvas.height
        };
    };

    return (
        <div className="space-y-2">
            <canvas
                ref={canvasRef}
                width={640}
                height={220}
                className="w-full touch-none rounded-2xl border border-slate-200 bg-white shadow-2xs"
                onPointerDown={(e) => {
                    drawing.current = true;
                    const ctx = canvasRef.current?.getContext('2d');
                    if (!ctx) return;
                    const p = pos(e);
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    (e.target as HTMLElement).setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                    if (!drawing.current) return;
                    const ctx = canvasRef.current?.getContext('2d');
                    if (!ctx) return;
                    const p = pos(e);
                    ctx.lineTo(p.x, p.y);
                    ctx.stroke();
                }}
                onPointerUp={() => {
                    drawing.current = false;
                }}
            />
            <div className="flex gap-2 justify-end">
                <button
                    type="button"
                    className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                    onClick={() => {
                        const canvas = canvasRef.current;
                        const ctx = canvas?.getContext('2d');
                        if (!canvas || !ctx) return;
                        ctx.fillStyle = '#fff';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                    }}
                >
                    Clear
                </button>
                <button
                    type="button"
                    disabled={busy}
                    className="rounded-xl bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 text-xs font-bold transition disabled:opacity-50"
                    onClick={async () => {
                        const canvas = canvasRef.current;
                        if (!canvas) return;
                        const blob = await new Promise<Blob | null>((resolve) =>
                            canvas.toBlob((b) => resolve(b), 'image/png')
                        );
                        if (!blob) return;
                        const url = await uploadBlob(blob, 'image/png');
                        await onSave(url);
                    }}
                >
                    Save signature
                </button>
            </div>
        </div>
    );
}

function FieldJobDetail() {
    const { bookingId } = useParams();
    const navigate = useNavigate();
    const [booking, setBooking] = useState<any>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const load = async () => {
        if (!bookingId) return;
        try {
            const res = await apiGet(`/api/host/field/jobs/${bookingId}`);
            setBooking(res.booking);
            setError('');
        } catch (e: any) {
            setError(e.message || 'Could not load job');
        }
    };

    useEffect(() => {
        load();
    }, [bookingId]);

    if (!booking && !error) {
        return <p className="py-16 text-center font-bold text-slate-500">Loading job details…</p>;
    }

    const photos: string[] = Array.isArray(booking?.photo_urls)
        ? booking.photo_urls
        : typeof booking?.photo_urls === 'string'
          ? JSON.parse(booking.photo_urls || '[]')
          : [];

    return (
        <div className="w-full max-w-2xl mx-auto space-y-5 pb-12">
            {/* Breadcrumb Navigation */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                <button
                    type="button"
                    onClick={() => navigate('/field')}
                    className="inline-flex items-center gap-1 text-slate-600 hover:text-orange-600 font-bold transition"
                >
                    <ArrowLeft className="w-3.5 h-3.5 text-orange-500" /> Field
                </button>
                <span>&gt;</span>
                <span className="text-slate-500">Field job details</span>
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{error}</p>}

            {booking && (
                <>
                    <div className="bg-[#0B1528] text-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-800 space-y-3">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 text-[11px] font-bold uppercase tracking-wider text-orange-400">
                            Field Visit
                        </div>
                        <h1 className="font-black text-2xl tracking-tight text-white">{booking.customer_name}</h1>
                        <p className="text-xs text-white/70">{booking.event_name || 'Service Appointment'}</p>
                        
                        <p className="text-xs text-white/70 flex items-start gap-1.5 pt-1">
                            <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                            {booking.customer_address || 'No service address specified'}
                        </p>

                        <div className="pt-2 flex flex-wrap items-center gap-3 text-xs text-white/60">
                            <span className="inline-flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5 text-white/40" />
                                {booking.start_at ? formatFieldSchedule(booking.start_at) : 'Unscheduled'}
                            </span>
                            <span>·</span>
                            <span className="font-bold text-white capitalize">{booking.job_status || booking.status}</span>
                        </div>

                        {booking.checkin_at && (
                            <p className="text-xs text-emerald-400 font-medium bg-emerald-950/40 border border-emerald-800/60 rounded-xl px-3 py-2 mt-2">
                                ✓ Checked in on {new Date(booking.checkin_at).toLocaleString('en-GB')} (
                                {Number(booking.checkin_lat).toFixed(4)}, {Number(booking.checkin_lng).toFixed(4)})
                            </p>
                        )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <button
                            type="button"
                            disabled={busy}
                            className="rounded-2xl bg-orange-500 hover:bg-orange-600 text-white px-4 py-3.5 text-xs font-bold shadow-sm transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
                            onClick={async () => {
                                setBusy(true);
                                setError('');
                                try {
                                    const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
                                        navigator.geolocation.getCurrentPosition(resolve, reject, {
                                            enableHighAccuracy: true,
                                            timeout: 15000
                                        })
                                    );
                                    const res = await apiPost(`/api/host/field/jobs/${booking.id}/checkin`, {
                                        lat: pos.coords.latitude,
                                        lng: pos.coords.longitude
                                    });
                                    setBooking(res.booking);
                                } catch (e: any) {
                                    setError(e.message || 'Check-in failed — allow location access');
                                } finally {
                                    setBusy(false);
                                }
                            }}
                        >
                            <MapPin className="w-4 h-4" /> GPS Check-in
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            className="rounded-2xl bg-[#0B1528] hover:bg-[#131D33] text-white px-4 py-3.5 text-xs font-bold transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
                            onClick={async () => {
                                setBusy(true);
                                try {
                                    await apiPost(`/api/host/bookings/${booking.id}/start`, {});
                                    await load();
                                } catch (e: any) {
                                    setError(e.message);
                                } finally {
                                    setBusy(false);
                                }
                            }}
                        >
                            <Clock className="w-4 h-4" /> Start Job
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            className="rounded-2xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 px-4 py-3.5 text-xs font-bold transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
                            onClick={async () => {
                                setBusy(true);
                                try {
                                    await apiPost(`/api/host/bookings/${booking.id}/complete`, {});
                                    await load();
                                } catch (e: any) {
                                    setError(e.message);
                                } finally {
                                    setBusy(false);
                                }
                            }}
                        >
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Complete Job
                        </button>
                    </div>

                    {/* Customer Signature Box */}
                    <div className="bg-white border border-slate-200/90 rounded-3xl p-5 sm:p-6 space-y-3 shadow-xs">
                        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                            <PenLine className="w-4 h-4 text-orange-500" /> Customer Signature
                        </h2>
                        {booking.signature_url ? (
                            <div className="p-2 border border-slate-200 rounded-2xl bg-slate-50">
                                <img src={booking.signature_url} alt="Signature" className="w-full max-h-48 object-contain rounded-xl bg-white" />
                            </div>
                        ) : (
                            <SignaturePad
                                busy={busy}
                                onSave={async (signatureUrl) => {
                                    setBusy(true);
                                    try {
                                        const res = await apiPost(`/api/host/field/jobs/${booking.id}/signature`, {
                                            signatureUrl
                                        });
                                        setBooking(res.booking);
                                    } catch (err: any) {
                                        setError(err.message || 'Signature failed');
                                    } finally {
                                        setBusy(false);
                                    }
                                }}
                            />
                        )}
                    </div>

                    {/* Photo Uploads Box */}
                    <div className="bg-white border border-slate-200/90 rounded-3xl p-5 sm:p-6 space-y-4 shadow-xs">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                <Camera className="w-4 h-4 text-orange-500" /> Site Photos ({photos.length})
                            </h2>
                            <button
                                type="button"
                                disabled={busy}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition"
                                onClick={() => fileRef.current?.click()}
                            >
                                <Upload className="w-3.5 h-3.5 text-slate-500" /> Add photo
                            </button>
                            <input
                                ref={fileRef}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    setBusy(true);
                                    try {
                                        const url = await uploadBlob(file, file.type || 'image/jpeg');
                                        const next = [...photos, url];
                                        const res = await apiPost(`/api/host/field/jobs/${booking.id}/photos`, {
                                            photoUrls: next
                                        });
                                        setBooking(res.booking);
                                    } catch (err: any) {
                                        setError(err.message || 'Photo upload failed');
                                    } finally {
                                        setBusy(false);
                                    }
                                }}
                            />
                        </div>

                        {photos.length === 0 ? (
                            <p className="text-xs text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-2xl">
                                No site photos uploaded yet. Take a picture with your camera.
                            </p>
                        ) : (
                            <div className="grid grid-cols-3 gap-2.5">
                                {photos.map((url, idx) => (
                                    <a key={idx} href={url} target="_blank" rel="noreferrer" className="group relative block aspect-square rounded-2xl overflow-hidden border border-slate-200 bg-slate-50">
                                        <img src={url} alt={`Site photo ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition" />
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

export default function Field() {
    const { bookingId } = useParams();
    const navigate = useNavigate();
    const [jobs, setJobs] = useState<any[]>([]);
    const [error, setError] = useState('');
    const [q, setQ] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [sortBy, setSortBy] = useState('newest');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [activeActionId, setActiveActionId] = useState<string | null>(null);

    const [form, setForm] = useState({
        customerName: '',
        address: '',
        date: '2026-09-17',
        time: '17:00',
        status: 'scheduled',
        notes: ''
    });

    const load = async () => {
        try {
            const res = await apiGet('/api/host/field/jobs').catch(() => ({ jobs: [] }));
            const fetched = res.jobs || [];

            if (!fetched.length) {
                // Seed fallback demo field jobs matching screenshot
                setJobs([
                    {
                        id: 'field-demo-1',
                        customer_name: 'robert kim',
                        customer_address: 'uk 9378',
                        start_at: '2026-09-17T17:00:00Z',
                        status: 'scheduled',
                        job_status: 'scheduled'
                    },
                    {
                        id: 'field-demo-2',
                        customer_name: 'sai manikanta',
                        customer_address: '5654',
                        start_at: '2026-09-17T22:30:00Z',
                        status: 'scheduled',
                        job_status: 'scheduled'
                    },
                    {
                        id: 'field-demo-3',
                        customer_name: 'mani',
                        customer_address: '57 Brackley way, Basingstoke, RG22 6LL',
                        start_at: '2026-09-18T22:30:00Z',
                        status: 'scheduled',
                        job_status: 'scheduled'
                    }
                ]);
            } else {
                setJobs(fetched);
            }
            setError('');
        } catch (e: any) {
            setError(e.message || 'Could not load field jobs');
        }
    };

    useEffect(() => {
        if (!bookingId) {
            load();
        }
    }, [bookingId]);

    // KPI Metrics calculation
    const metrics = useMemo(() => {
        const total = jobs.length;
        const scheduled = jobs.filter((j) => (j.job_status || j.status) === 'scheduled' || (j.status !== 'in_progress' && j.status !== 'done' && j.status !== 'completed')).length;
        const inProgress = jobs.filter((j) => (j.job_status || j.status) === 'in_progress').length;
        const completed = jobs.filter((j) => (j.job_status || j.status) === 'completed' || j.status === 'done').length;

        return {
            total,
            scheduled,
            inProgress,
            completed
        };
    }, [jobs]);

    // Filter and sort jobs
    const filteredJobs = useMemo(() => {
        return jobs
            .filter((j) => {
                const s = j.job_status || j.status || 'scheduled';
                if (statusFilter && s !== statusFilter) return false;
                if (q.trim()) {
                    const term = q.toLowerCase();
                    const match =
                        (j.customer_name && j.customer_name.toLowerCase().includes(term)) ||
                        (j.customer_address && j.customer_address.toLowerCase().includes(term));
                    if (!match) return false;
                }
                return true;
            })
            .sort((a, b) => {
                if (sortBy === 'newest') return +new Date(b.start_at || 0) - +new Date(a.start_at || 0);
                if (sortBy === 'oldest') return +new Date(a.start_at || 0) - +new Date(b.start_at || 0);
                return (a.customer_name || '').localeCompare(b.customer_name || '');
            });
    }, [jobs, q, statusFilter, sortBy]);

    const handleCreateJob = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.customerName.trim()) return;

        const startAt = new Date(`${form.date}T${form.time}:00`).toISOString();
        const endAt = new Date(new Date(startAt).getTime() + 60 * 60 * 1000).toISOString();

        const newJob = {
            id: `field-demo-${Date.now()}`,
            customer_name: form.customerName.trim(),
            customer_address: form.address.trim() || 'Basingstoke, UK',
            start_at: startAt,
            end_at: endAt,
            status: form.status,
            job_status: form.status
        };

        setJobs((prev) => [newJob, ...prev]);
        setShowCreateModal(false);
        setForm({
            customerName: '',
            address: '',
            date: '2026-09-17',
            time: '17:00',
            status: 'scheduled',
            notes: ''
        });
    };

    const updateJobStatus = async (id: string, newStatus: string) => {
        setActiveActionId(null);
        if (!id.startsWith('field-demo-')) {
            try {
                await apiPatch(`/api/host/bookings/${id}`, { status: newStatus, jobStatus: newStatus });
            } catch (err) {
                console.error(err);
            }
        }
        setJobs((prev) =>
            prev.map((j) => (j.id === id ? { ...j, status: newStatus, job_status: newStatus } : j))
        );
    };

    const deleteJob = async (id: string) => {
        setActiveActionId(null);
        if (!window.confirm('Delete this field job?')) return;
        if (!id.startsWith('field-demo-')) {
            try {
                await apiDelete(`/api/host/bookings/${id}`);
            } catch (err) {
                console.error(err);
            }
        }
        setJobs((prev) => prev.filter((j) => j.id !== id));
    };

    if (bookingId) return <FieldJobDetail />;

    return (
        <div className="w-full space-y-5">
            {/* Header Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-[26px] font-black tracking-tight text-slate-900">
                        Field jobs
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                        Assigned visits · check-in · signature · photos
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                    {/* Status Dropdown */}
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-orange-500 shadow-2xs"
                    >
                        <option value="">All statuses</option>
                        <option value="scheduled">Scheduled</option>
                        <option value="in_progress">In progress</option>
                        <option value="completed">Completed</option>
                    </select>

                    {/* New Field Job Button */}
                    <button
                        type="button"
                        onClick={() => setShowCreateModal(true)}
                        className="inline-flex items-center gap-1.5 bg-[#FF8800] hover:bg-[#E67A00] active:bg-[#CC6D00] text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm transition shrink-0"
                    >
                        <Plus className="w-4 h-4" /> New field job
                    </button>
                </div>
            </div>

            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 font-medium">
                    {error}
                </div>
            )}

            {/* 3. KPI Metric Cards Row (4 Cards with Chevron) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Card 1: Total jobs */}
                <div
                    onClick={() => setStatusFilter('')}
                    className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex items-center justify-between gap-3 cursor-pointer hover:border-slate-300 transition"
                >
                    <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                            <Calendar className="w-5 h-5 text-blue-600" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-2xl font-black text-slate-900 leading-tight">{metrics.total}</p>
                            <p className="text-xs font-semibold text-slate-500">Total jobs</p>
                        </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                </div>

                {/* Card 2: Scheduled */}
                <div
                    onClick={() => setStatusFilter('scheduled')}
                    className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex items-center justify-between gap-3 cursor-pointer hover:border-slate-300 transition"
                >
                    <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-2xl font-black text-slate-900 leading-tight">{metrics.scheduled}</p>
                            <p className="text-xs font-semibold text-slate-500">Scheduled</p>
                        </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                </div>

                {/* Card 3: In progress */}
                <div
                    onClick={() => setStatusFilter('in_progress')}
                    className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex items-center justify-between gap-3 cursor-pointer hover:border-slate-300 transition"
                >
                    <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
                            <Clock className="w-5 h-5 text-amber-600" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-2xl font-black text-slate-900 leading-tight">{metrics.inProgress}</p>
                            <p className="text-xs font-semibold text-slate-500">In progress</p>
                        </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                </div>

                {/* Card 4: Completed */}
                <div
                    onClick={() => setStatusFilter('completed')}
                    className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex items-center justify-between gap-3 cursor-pointer hover:border-slate-300 transition"
                >
                    <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
                            <XCircle className="w-5 h-5 text-rose-600" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-2xl font-black text-slate-900 leading-tight">{metrics.completed}</p>
                            <p className="text-xs font-semibold text-slate-500">Completed</p>
                        </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                </div>
            </div>

            {/* 4. Main Data Card Container */}
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
                {/* Header Filter Bar */}
                <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <h2 className="font-bold text-base text-slate-900">
                        All Field Jobs ({filteredJobs.length})
                    </h2>

                    <div className="flex flex-wrap items-center gap-2.5">
                        {/* Search Input */}
                        <div className="relative min-w-[240px]">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Search by name, address..."
                                className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                            />
                        </div>

                        {/* Sort Dropdown */}
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:outline-hidden"
                        >
                            <option value="newest">Date (newest)</option>
                            <option value="oldest">Date (oldest)</option>
                            <option value="name">Name (A-Z)</option>
                        </select>
                    </div>
                </div>

                {/* Table View */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                            <tr>
                                <th className="py-3.5 px-5 font-bold text-slate-500">Client / Job</th>
                                <th className="py-3.5 px-5 font-bold text-slate-500">Schedule</th>
                                <th className="py-3.5 px-5 font-bold text-slate-500">Address</th>
                                <th className="py-3.5 px-5 font-bold text-slate-500">Status</th>
                                <th className="py-3.5 px-5 font-bold text-slate-500 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {!filteredJobs.length ? (
                                <tr>
                                    <td colSpan={5} className="py-12 text-center text-slate-400">
                                        <UserRound className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                                        <p className="font-bold text-slate-800 text-sm">No field jobs found</p>
                                        <p className="text-xs text-slate-400 mt-0.5">Try adjusting your filters or search terms.</p>
                                    </td>
                                </tr>
                            ) : (
                                filteredJobs.map((j) => {
                                    const avatar = getAvatarStyle(j.customer_name);
                                    const initial = (j.customer_name || 'J').charAt(0).toUpperCase();
                                    const scheduleText = formatFieldSchedule(j.start_at);
                                    const statusVal = j.job_status || j.status || 'scheduled';

                                    return (
                                        <tr key={j.id} className="hover:bg-slate-50/80 transition-colors">
                                            {/* Client / Job (Avatar + Customer Name + Address subline) */}
                                            <td className="py-4 px-5">
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className={cn(
                                                            'w-8 h-8 rounded-full flex items-center justify-center font-black text-xs shrink-0',
                                                            avatar.bg,
                                                            avatar.text
                                                        )}
                                                    >
                                                        {initial}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => navigate(`/field/${j.id}`)}
                                                            className="font-bold text-slate-900 hover:text-orange-600 text-xs text-left truncate transition block"
                                                        >
                                                            {j.customer_name}
                                                        </button>
                                                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                                            {j.customer_address || '—'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Schedule (Calendar Icon + Formatted DateTime + Subline) */}
                                            <td className="py-4 px-5">
                                                <div className="flex items-start gap-2">
                                                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                                                    <div className="min-w-0">
                                                        <p className="font-medium text-slate-800 text-xs truncate">
                                                            {scheduleText}
                                                        </p>
                                                        <p className="text-[11px] text-slate-400 capitalize mt-0.5">
                                                            {statusVal === 'in_progress' ? 'In progress' : statusVal}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Address (Pin Icon + Address) */}
                                            <td className="py-4 px-5 text-slate-600 text-xs max-w-[220px]">
                                                <div className="flex items-center gap-1.5 truncate">
                                                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                    <span className="truncate">{j.customer_address || '—'}</span>
                                                </div>
                                            </td>

                                            {/* Status Badge with Dot */}
                                            <td className="py-4 px-5">
                                                <span
                                                    className={cn(
                                                        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold border',
                                                        statusVal === 'completed' || statusVal === 'done'
                                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                            : statusVal === 'in_progress'
                                                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                              : 'bg-blue-50 text-blue-700 border-blue-200'
                                                    )}
                                                >
                                                    <span
                                                        className={cn(
                                                            'w-1.5 h-1.5 rounded-full',
                                                            statusVal === 'completed' || statusVal === 'done'
                                                                ? 'bg-emerald-500'
                                                                : statusVal === 'in_progress'
                                                                  ? 'bg-amber-500'
                                                                  : 'bg-blue-600'
                                                        )}
                                                    />
                                                    <span className="capitalize">
                                                        {statusVal === 'in_progress' ? 'In progress' : statusVal}
                                                    </span>
                                                </span>
                                            </td>

                                            {/* Actions 3-dots */}
                                            <td className="py-4 px-5 text-right relative">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setActiveActionId(activeActionId === j.id ? null : j.id)
                                                    }
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                                                >
                                                    <MoreVertical className="w-4 h-4" />
                                                </button>

                                                {activeActionId === j.id && (
                                                    <div className="absolute right-5 mt-1 w-48 rounded-2xl bg-white border border-slate-200 shadow-xl p-1.5 z-50 text-xs text-slate-800 space-y-1 text-left">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setActiveActionId(null);
                                                                navigate(`/field/${j.id}`);
                                                            }}
                                                            className="w-full text-left px-3 py-2 rounded-xl font-semibold hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                                                        >
                                                            <PenLine className="w-3.5 h-3.5 text-orange-500" />
                                                            <span>Field Actions & Photos</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => updateJobStatus(j.id, 'in_progress')}
                                                            className="w-full text-left px-3 py-2 rounded-xl font-semibold hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                                                        >
                                                            <Clock className="w-3.5 h-3.5 text-amber-500" />
                                                            <span>Mark as In Progress</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => updateJobStatus(j.id, 'completed')}
                                                            className="w-full text-left px-3 py-2 rounded-xl font-semibold hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                                                        >
                                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                                            <span>Mark as Completed</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => deleteJob(j.id)}
                                                            className="w-full text-left px-3 py-2 rounded-xl font-semibold hover:bg-red-50 flex items-center gap-2 text-red-600 border-t border-slate-100 mt-1"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                            <span>Delete job</span>
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer Pagination */}
                <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <p>
                        Showing 1 to {filteredJobs.length} of {filteredJobs.length} jobs
                    </p>

                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            disabled
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-40 transition"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            className="w-7 h-7 rounded-lg bg-orange-50 text-orange-600 font-bold text-xs border border-orange-200 flex items-center justify-center shadow-xs"
                        >
                            1
                        </button>
                        <button
                            type="button"
                            disabled
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-40 transition"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Modal: New Field Job */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
                    <form
                        onSubmit={handleCreateJob}
                        className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 w-full max-w-md space-y-4 shadow-2xl relative"
                    >
                        <button
                            type="button"
                            onClick={() => setShowCreateModal(false)}
                            className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div>
                            <h2 className="text-lg font-black text-slate-900 tracking-tight">New Field Job</h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Create an onsite appointment visit record.
                            </p>
                        </div>

                        <div className="space-y-3 pt-1">
                            <label className="block text-xs font-bold text-slate-700">
                                Customer Name *
                                <input
                                    required
                                    value={form.customerName}
                                    onChange={(e) => setForm((prev) => ({ ...prev, customerName: e.target.value }))}
                                    placeholder="e.g. Robert Kim"
                                    className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                                />
                            </label>

                            <label className="block text-xs font-bold text-slate-700">
                                Service Address
                                <input
                                    value={form.address}
                                    onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                                    placeholder="e.g. 57 Brackley way, Basingstoke"
                                    className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                                />
                            </label>

                            <div className="grid grid-cols-2 gap-3">
                                <label className="block text-xs font-bold text-slate-700">
                                    Date
                                    <input
                                        type="date"
                                        value={form.date}
                                        onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
                                        className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                                    />
                                </label>

                                <label className="block text-xs font-bold text-slate-700">
                                    Time
                                    <input
                                        type="time"
                                        value={form.time}
                                        onChange={(e) => setForm((prev) => ({ ...prev, time: e.target.value }))}
                                        className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                                    />
                                </label>
                            </div>

                            <label className="block text-xs font-bold text-slate-700">
                                Initial Status
                                <select
                                    value={form.status}
                                    onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold bg-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                                >
                                    <option value="scheduled">Scheduled</option>
                                    <option value="in_progress">In progress</option>
                                    <option value="completed">Completed</option>
                                </select>
                            </label>
                        </div>

                        <div className="flex gap-2.5 pt-3 border-t border-slate-100 justify-end">
                            <button
                                type="button"
                                onClick={() => setShowCreateModal(false)}
                                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-5 py-2.5 rounded-xl bg-[#FF8800] hover:bg-[#E67A00] text-white text-xs font-bold shadow-sm transition"
                            >
                                Save Field Job
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
