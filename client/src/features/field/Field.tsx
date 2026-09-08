import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, CheckCircle2, MapPin, PenLine } from 'lucide-react';
import { apiGet, apiPost } from '../../shared/utils';

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
                className="w-full touch-none rounded-xl border border-[#E2E8F0] bg-white"
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
            <div className="flex gap-2">
                <button
                    type="button"
                    className="rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs font-bold"
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
                    className="rounded-xl bg-[#0F172A] text-white px-3 py-2 text-xs font-bold disabled:opacity-50"
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bookingId]);

    if (!booking && !error) {
        return <p className="py-16 text-center font-bold text-[#64748B]">Loading job…</p>;
    }

    const photos: string[] = Array.isArray(booking?.photo_urls)
        ? booking.photo_urls
        : typeof booking?.photo_urls === 'string'
          ? JSON.parse(booking.photo_urls || '[]')
          : [];

    return (
        <div className="w-full max-w-lg mx-auto space-y-4 pb-10">
            <button
                type="button"
                onClick={() => navigate('/field')}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#64748B]"
            >
                <ArrowLeft className="w-4 h-4" /> My jobs
            </button>
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
            {booking && (
                <>
                    <div className="bg-[#0F172A] text-white rounded-2xl px-4 py-4">
                        <p className="text-xs text-white/50 uppercase tracking-widest">Field</p>
                        <h1 className="font-black text-xl mt-1">{booking.customer_name}</h1>
                        <p className="text-sm text-white/70 mt-1">{booking.event_name}</p>
                        <p className="text-sm text-white/60 mt-2 flex items-start gap-1">
                            <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                            {booking.customer_address || 'No address'}
                        </p>
                        <p className="text-xs text-white/50 mt-2">
                            {booking.start_at
                                ? new Date(booking.start_at).toLocaleString('en-GB', {
                                      dateStyle: 'medium',
                                      timeStyle: 'short'
                                  })
                                : '—'}
                            {' · '}
                            {booking.job_status || booking.status}
                        </p>
                        {booking.checkin_at && (
                            <p className="text-xs text-emerald-300 mt-2">
                                Checked in {new Date(booking.checkin_at).toLocaleString('en-GB')} (
                                {Number(booking.checkin_lat).toFixed(4)}, {Number(booking.checkin_lng).toFixed(4)})
                            </p>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            disabled={busy}
                            className="rounded-xl bg-amber-500 text-white px-3 py-3 text-sm font-bold disabled:opacity-50"
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
                            GPS check-in
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            className="rounded-xl bg-[#0F172A] text-white px-3 py-3 text-sm font-bold disabled:opacity-50"
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
                            Start job
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            className="col-span-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 px-3 py-3 text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2"
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
                            <CheckCircle2 className="w-4 h-4" /> Complete job
                        </button>
                    </div>

                    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 space-y-2">
                        <h2 className="text-xs font-bold uppercase text-[#64748B] flex items-center gap-1">
                            <PenLine className="w-3.5 h-3.5" /> Customer signature
                        </h2>
                        {booking.signature_url ? (
                            <img src={booking.signature_url} alt="Signature" className="w-full rounded-xl border border-[#E2E8F0]" />
                        ) : (
                            <SignaturePad
                                busy={busy}
                                onSave={async (url) => {
                                    setBusy(true);
                                    try {
                                        const res = await apiPost(`/api/host/field/jobs/${booking.id}/signature`, {
                                            signatureUrl: url
                                        });
                                        setBooking(res.booking);
                                    } catch (e: any) {
                                        setError(e.message);
                                    } finally {
                                        setBusy(false);
                                    }
                                }}
                            />
                        )}
                    </div>

                    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 space-y-3">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xs font-bold uppercase text-[#64748B] flex items-center gap-1">
                                <Camera className="w-3.5 h-3.5" /> Photos
                            </h2>
                            <button
                                type="button"
                                className="text-xs font-bold text-[#F59E0B]"
                                onClick={() => fileRef.current?.click()}
                            >
                                Add photo
                            </button>
                            <input
                                ref={fileRef}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    e.target.value = '';
                                    if (!file) return;
                                    setBusy(true);
                                    setError('');
                                    try {
                                        const url = await uploadBlob(file, file.type || 'image/jpeg');
                                        const res = await apiPost(`/api/host/field/jobs/${booking.id}/photos`, {
                                            urls: [url]
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
                        <div className="grid grid-cols-3 gap-2">
                            {photos.map((url) => (
                                <a key={url} href={url} target="_blank" rel="noreferrer">
                                    <img src={url} alt="" className="aspect-square object-cover rounded-lg border border-[#E2E8F0]" />
                                </a>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

export default function Field() {
    const { bookingId } = useParams();
    const [jobs, setJobs] = useState<any[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (bookingId) return;
        (async () => {
            setLoading(true);
            try {
                const res = await apiGet('/api/host/field/jobs');
                setJobs(res.jobs || []);
                setError('');
            } catch (e: any) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        })();
    }, [bookingId]);

    if (bookingId) return <FieldJobDetail />;

    return (
        <div className="w-full max-w-lg mx-auto space-y-4">
            <div className="bg-[#0F172A] rounded-2xl text-white px-4 py-4">
                <p className="text-xs text-white/50 uppercase tracking-widest">Booking Plots</p>
                <h1 className="font-black text-xl">Field jobs</h1>
                <p className="text-sm text-white/60 mt-1">Assigned visits · check-in · signature · photos</p>
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
            {loading ? (
                <p className="text-center text-[#64748B] font-bold py-10">Loading…</p>
            ) : jobs.length === 0 ? (
                <p className="text-center text-[#64748B] text-sm py-10">No open assigned jobs.</p>
            ) : (
                <ul className="space-y-2">
                    {jobs.map((j) => (
                        <li key={j.id}>
                            <Link
                                to={`/field/${j.id}`}
                                className="block bg-white border border-[#E2E8F0] rounded-2xl px-4 py-3 hover:border-amber-300"
                            >
                                <p className="font-bold text-[#0F172A]">{j.customer_name}</p>
                                <p className="text-xs text-[#64748B] mt-0.5">
                                    {j.start_at
                                        ? new Date(j.start_at).toLocaleString('en-GB', {
                                              dateStyle: 'medium',
                                              timeStyle: 'short'
                                          })
                                        : 'Unscheduled'}
                                    {' · '}
                                    {j.job_status || j.status}
                                </p>
                                {j.customer_address && (
                                    <p className="text-xs text-[#94A3B8] mt-1 truncate">{j.customer_address}</p>
                                )}
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
