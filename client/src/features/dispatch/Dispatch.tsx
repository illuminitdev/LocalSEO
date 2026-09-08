import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, MapPin, ExternalLink } from 'lucide-react';
import { apiGet, apiPatch } from '../../shared/utils';
import PlacesMap, { geocodeAddress, mapsJsConfigured, type MapMarker } from '../../shared/PlacesMap';

function startOfWeek(d: Date) {
    const x = new Date(d);
    const day = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - day);
    x.setHours(0, 0, 0, 0);
    return x;
}

export default function Dispatch() {
    const [bookings, setBookings] = useState<any[]>([]);
    const [members, setMembers] = useState<any[]>([]);
    const [assignee, setAssignee] = useState('');
    const [error, setError] = useState('');
    const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
    const [mapMarkers, setMapMarkers] = useState<MapMarker[]>([]);

    const load = async () => {
        try {
            const dash = await apiGet('/api/host/dashboard');
            setBookings(dash.bookings || []);
            const team = await apiGet('/api/host/team');
            setMembers(team.members || []);
        } catch (e: any) {
            setError(e.message);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const weekDays = useMemo(() => {
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(weekStart);
            d.setDate(d.getDate() + i);
            return d;
        });
    }, [weekStart]);

    const filtered = useMemo(() => {
        let list = [...bookings].filter((b) => b.status !== 'cancelled');
        if (assignee) list = list.filter((b) => b.assigned_user_id === assignee);
        return list.sort((a, b) => (a.route_sort || 0) - (b.route_sort || 0) || +new Date(a.start_at) - +new Date(b.start_at));
    }, [bookings, assignee]);

    const byDay = (day: Date) =>
        filtered.filter((b) => {
            const s = new Date(b.start_at);
            return s.toDateString() === day.toDateString();
        });

    const routeJobs = useMemo(
        () => filtered.filter((b) => b.customer_address),
        [filtered]
    );

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!mapsJsConfigured() || !routeJobs.length) {
                setMapMarkers([]);
                return;
            }
            const markers: MapMarker[] = [];
            for (let i = 0; i < Math.min(routeJobs.length, 12); i++) {
                const b = routeJobs[i];
                const geo = await geocodeAddress(String(b.customer_address));
                if (geo) {
                    markers.push({
                        lat: geo.lat,
                        lng: geo.lng,
                        label: String(i + 1),
                        title: `${b.customer_name || 'Job'} — ${b.customer_address}`,
                        highlight: i === 0,
                        color: '#F59E0B'
                    });
                }
            }
            if (!cancelled) setMapMarkers(markers);
        })();
        return () => {
            cancelled = true;
        };
    }, [routeJobs]);

    const mapsUrl = () => {
        const addrs = routeJobs.map((b) => b.customer_address).slice(0, 8);
        if (!addrs.length) return null;
        const dest = encodeURIComponent(addrs[addrs.length - 1]);
        const waypoints = addrs.slice(0, -1).map(encodeURIComponent).join('|');
        return `https://www.google.com/maps/dir/?api=1&destination=${dest}${waypoints ? `&waypoints=${waypoints}` : ''}`;
    };

    const onDrop = async (bookingId: string, day: Date) => {
        const booking = bookings.find((b) => b.id === bookingId);
        if (!booking) return;
        const start = new Date(booking.start_at);
        const end = new Date(booking.end_at);
        const dur = end.getTime() - start.getTime();
        const nextStart = new Date(day);
        nextStart.setHours(start.getHours(), start.getMinutes(), 0, 0);
        const nextEnd = new Date(nextStart.getTime() + dur);
        try {
            await apiPatch(`/api/host/bookings/${bookingId}`, {
                startAt: nextStart.toISOString(),
                endAt: nextEnd.toISOString()
            });
            await load();
        } catch (e: any) {
            setError(e.message);
        }
    };

    return (
        <div className="w-full space-y-4">
            <div className="bg-[#0F172A] rounded-2xl text-white px-4 py-4 lg:px-6 flex flex-col sm:flex-row sm:justify-between gap-3">
                <div>
                    <p className="text-xs text-white/50 uppercase tracking-widest">Booking Plots</p>
                    <h1 className="font-black text-xl flex items-center gap-2">
                        <CalendarDays className="w-5 h-5" /> Dispatch
                    </h1>
                    <p className="text-sm text-white/60 mt-1">Week calendar · assign · map pins · route list</p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                    <button type="button" className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold" onClick={() => setWeekStart((w) => { const n = new Date(w); n.setDate(n.getDate() - 7); return n; })}>
                        Prev
                    </button>
                    <button type="button" className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold" onClick={() => setWeekStart(startOfWeek(new Date()))}>
                        Today
                    </button>
                    <button type="button" className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold" onClick={() => setWeekStart((w) => { const n = new Date(w); n.setDate(n.getDate() + 7); return n; })}>
                        Next
                    </button>
                    <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="rounded-lg text-[#0F172A] px-2 py-1.5 text-xs">
                        <option value="">All assignees</option>
                        {members.map((m) => (
                            <option key={m.user_id} value={m.user_id}>
                                {m.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}

            <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
                {weekDays.map((day) => (
                    <div
                        key={day.toISOString()}
                        className="bg-white border border-[#E2E8F0] rounded-xl min-h-[140px] p-2"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                            e.preventDefault();
                            const id = e.dataTransfer.getData('text/booking-id');
                            if (id) onDrop(id, day);
                        }}
                    >
                        <p className="text-[10px] font-bold uppercase text-[#64748B] mb-2">
                            {day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}
                        </p>
                        <div className="space-y-1">
                            {byDay(day).map((b) => (
                                <div
                                    key={b.id}
                                    draggable
                                    onDragStart={(e) => e.dataTransfer.setData('text/booking-id', b.id)}
                                    className="rounded-lg bg-[#FFFBEB] border border-[#FDE68A] px-2 py-1 text-[11px] cursor-grab"
                                >
                                    <p className="font-bold truncate">{b.customer_name}</p>
                                    <p className="text-[#64748B]">
                                        {new Date(b.start_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                    <select
                                        className="mt-1 w-full text-[10px] rounded border border-[#E2E8F0]"
                                        value={b.assigned_user_id || ''}
                                        onChange={async (e) => {
                                            await apiPatch(`/api/host/bookings/${b.id}`, {
                                                assignedUserId: e.target.value || null
                                            });
                                            load();
                                        }}
                                    >
                                        <option value="">Unassigned</option>
                                        {members.map((m) => (
                                            <option key={m.user_id} value={m.user_id}>
                                                {m.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 space-y-3">
                <div className="flex justify-between items-center">
                    <h2 className="text-xs font-bold uppercase text-[#64748B] flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" /> Route map
                    </h2>
                    {mapsUrl() && (
                        <a href={mapsUrl()!} target="_blank" rel="noreferrer" className="text-xs font-bold text-[#F59E0B] inline-flex items-center gap-1">
                            Open in Google Maps <ExternalLink className="w-3 h-3" />
                        </a>
                    )}
                </div>
                <PlacesMap
                    markers={mapMarkers}
                    height={280}
                    showPlaceholder
                    title="Dispatch route"
                    placeholder={
                        mapsJsConfigured()
                            ? routeJobs.length
                                ? 'Geocoding job addresses…'
                                : 'Jobs with addresses appear here as map pins.'
                            : 'Add VITE_GOOGLE_MAPS_JS_KEY in client/.env to show live map pins.'
                    }
                />
                <ol className="space-y-2">
                    {routeJobs.map((b, idx) => (
                        <li key={b.id} className="flex gap-3 items-start text-sm border border-[#F1F5F9] rounded-xl px-3 py-2">
                            <span className="font-black text-[#F59E0B] w-5">{idx + 1}</span>
                            <div className="min-w-0 flex-1">
                                <p className="font-bold">{b.customer_name}</p>
                                <p className="text-xs text-[#64748B]">{b.customer_address}</p>
                            </div>
                            <input
                                type="number"
                                className="w-16 rounded border border-[#E2E8F0] px-1 text-xs"
                                value={b.route_sort ?? idx}
                                onChange={async (e) => {
                                    await apiPatch(`/api/host/bookings/${b.id}`, { routeSort: Number(e.target.value) });
                                    load();
                                }}
                            />
                        </li>
                    ))}
                </ol>
            </div>
        </div>
    );
}
