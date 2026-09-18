import { useEffect, useMemo, useState } from 'react';
import {
    Calendar as CalendarIcon,
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    MapPin,
    MoreVertical,
    Navigation,
    Plus,
    UserCheck,
    X
} from 'lucide-react';
import { apiGet, apiPatch, cn } from '../../shared/utils';
import PlacesMap, { geocodeAddress, mapsJsConfigured, type MapMarker } from '../../shared/PlacesMap';

// Basingstoke demo coordinates
const BASINGSTOKE_FALLBACK_COORDS = [
    { lat: 51.2745, lng: -1.0942, address: 'uk 9378, Basingstoke' },
    { lat: 51.2502, lng: -1.0664, address: '5654, Basingstoke' },
    { lat: 51.2584, lng: -1.0918, address: '57 Brackley way, Basingstoke, RG22 6LL' },
    { lat: 51.2468, lng: -1.1095, address: 'South Ham, Basingstoke' }
];

function startOfWeek(d: Date) {
    const x = new Date(d);
    const day = (x.getDay() + 6) % 7; // Monday = 0
    x.setDate(x.getDate() - day);
    x.setHours(0, 0, 0, 0);
    return x;
}

function formatWeekRange(start: Date) {
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const startDay = start.getDate();
    const endDay = end.getDate();
    const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
    const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
    const year = start.getFullYear();

    if (startMonth === endMonth) {
        return `${startDay} - ${endDay} ${startMonth} ${year}`;
    }
    return `${startDay} ${startMonth} - ${endDay} ${endMonth} ${year}`;
}

export default function Dispatch() {
    const [bookings, setBookings] = useState<any[]>([]);
    const [members, setMembers] = useState<any[]>([]);
    const [error, setError] = useState('');
    const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
    const [selectedDate, setSelectedDate] = useState<Date>(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return today;
    });
    const [mapMarkers, setMapMarkers] = useState<MapMarker[]>([]);
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [activeActionBookingId, setActiveActionBookingId] = useState<string | null>(null);

    const [newJobForm, setNewJobForm] = useState({
        customerName: '',
        address: '',
        time: '14:00',
        assignedUserId: '',
        date: ''
    });

    const load = async () => {
        try {
            const [dash, team] = await Promise.all([
                apiGet('/api/host/dashboard').catch(() => ({ bookings: [] })),
                apiGet('/api/host/team').catch(() => ({ members: [] }))
            ]);

            const fetchedBookings = dash.bookings || [];
            const fetchedMembers = team.members || [];

            setMembers(
                fetchedMembers.length > 0
                    ? fetchedMembers
                    : [
                          { user_id: 'mem-1', name: 'Karun' },
                          { user_id: 'mem-2', name: 'Carmen' },
                          { user_id: 'mem-3', name: 'Alex' }
                      ]
            );

            // If no bookings or empty schedule, seed demo jobs matching the week
            if (!fetchedBookings.length) {
                const mon = startOfWeek(weekStart);
                const thu = new Date(mon);
                thu.setDate(thu.getDate() + 3);
                const fri = new Date(mon);
                fri.setDate(fri.getDate() + 4);

                setBookings([
                    {
                        id: 'disp-demo-1',
                        customer_name: 'robert kim',
                        customer_address: 'uk 9378',
                        start_at: new Date(thu.setHours(17, 0, 0, 0)).toISOString(),
                        end_at: new Date(thu.setHours(18, 0, 0, 0)).toISOString(),
                        status: 'scheduled',
                        assigned_user_id: null,
                        route_sort: 1,
                        lat: 51.2745,
                        lng: -1.0942
                    },
                    {
                        id: 'disp-demo-2',
                        customer_name: 'sai manikanta',
                        customer_address: '5654',
                        start_at: new Date(thu.setHours(22, 30, 0, 0)).toISOString(),
                        end_at: new Date(thu.setHours(23, 30, 0, 0)).toISOString(),
                        status: 'scheduled',
                        assigned_user_id: null,
                        route_sort: 2,
                        lat: 51.2502,
                        lng: -1.0664
                    },
                    {
                        id: 'disp-demo-3',
                        customer_name: 'mani',
                        customer_address: '57 Brackley way, Basingstoke, RG22 6LL',
                        start_at: new Date(fri.setHours(22, 30, 0, 0)).toISOString(),
                        end_at: new Date(fri.setHours(23, 30, 0, 0)).toISOString(),
                        status: 'scheduled',
                        assigned_user_id: 'mem-1',
                        assigned_name: 'Karun',
                        route_sort: 1,
                        lat: 51.2584,
                        lng: -1.0918
                    }
                ]);
            } else {
                setBookings(fetchedBookings);
            }
        } catch (e: any) {
            setError(e.message || 'Could not load dispatch schedule');
        }
    };

    useEffect(() => {
        load();
    }, [weekStart]);

    // 7 days of the currently selected week
    const weekDays = useMemo(() => {
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(weekStart);
            d.setDate(d.getDate() + i);
            d.setHours(0, 0, 0, 0);
            return d;
        });
    }, [weekStart]);

    // Ensure selected date stays in sync when week moves
    useEffect(() => {
        const inWeek = weekDays.some((d) => d.toDateString() === selectedDate.toDateString());
        if (!inWeek && weekDays.length > 0) {
            // Default to Thursday of the week or first day with jobs
            const dayWithJobs = weekDays.find((d) => {
                return bookings.some((b) => new Date(b.start_at).toDateString() === d.toDateString());
            });
            setSelectedDate(dayWithJobs || weekDays[3] || weekDays[0]);
        }
    }, [weekDays, bookings]);

    const getBookingsForDay = (day: Date) => {
        return bookings
            .filter((b) => {
                if (b.status === 'cancelled') return false;
                const s = new Date(b.start_at);
                return s.toDateString() === day.toDateString();
            })
            .sort((a, b) => (a.route_sort || 0) - (b.route_sort || 0) || +new Date(a.start_at) - +new Date(b.start_at));
    };

    const selectedDayBookings = useMemo(() => {
        return getBookingsForDay(selectedDate);
    }, [bookings, selectedDate]);

    // Update map markers whenever selected day's bookings change
    useEffect(() => {
        let isCancelled = false;

        const updateMarkers = async () => {
            if (!selectedDayBookings.length) {
                // Show default Basingstoke area route pins for presentation
                setMapMarkers(
                    BASINGSTOKE_FALLBACK_COORDS.map((coord, idx) => ({
                        lat: coord.lat,
                        lng: coord.lng,
                        label: String(idx + 1),
                        title: `Stop ${idx + 1} — ${coord.address}`,
                        highlight: idx === 0,
                        color: '#FF8800'
                    }))
                );
                return;
            }

            const markers: MapMarker[] = [];
            for (let i = 0; i < selectedDayBookings.length; i++) {
                const b = selectedDayBookings[i];
                let lat = b.lat;
                let lng = b.lng;

                if ((lat == null || lng == null) && b.customer_address) {
                    const geo = await geocodeAddress(String(b.customer_address));
                    if (geo) {
                        lat = geo.lat;
                        lng = geo.lng;
                    }
                }

                // Fallback to coordinates map if address is demo-based
                if (lat == null || lng == null) {
                    const fallback = BASINGSTOKE_FALLBACK_COORDS[i % BASINGSTOKE_FALLBACK_COORDS.length];
                    lat = fallback.lat;
                    lng = fallback.lng;
                }

                markers.push({
                    lat,
                    lng,
                    label: String(i + 1),
                    title: `${b.customer_name || 'Job'} — ${b.customer_address || 'Basingstoke'}`,
                    highlight: i === 0,
                    color: '#FF8800'
                });
            }

            if (!isCancelled) {
                setMapMarkers(markers);
            }
        };

        updateMarkers();

        return () => {
            isCancelled = true;
        };
    }, [selectedDayBookings]);

    // Google Maps Navigation URL
    const googleMapsRouteUrl = useMemo(() => {
        const addresses = selectedDayBookings
            .map((b) => b.customer_address || 'Basingstoke, UK')
            .filter(Boolean);

        if (!addresses.length) {
            return 'https://www.google.com/maps/search/Basingstoke';
        }

        if (addresses.length === 1) {
            return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addresses[0])}`;
        }

        const dest = encodeURIComponent(addresses[addresses.length - 1]);
        const waypoints = addresses.slice(0, -1).map(encodeURIComponent).join('|');
        return `https://www.google.com/maps/dir/?api=1&destination=${dest}${waypoints ? `&waypoints=${waypoints}` : ''}`;
    }, [selectedDayBookings]);

    const handleAssignTeamMember = async (bookingId: string, userId: string) => {
        setActiveActionBookingId(null);
        try {
            if (!bookingId.startsWith('disp-demo-')) {
                await apiPatch(`/api/host/bookings/${bookingId}`, {
                    assignedUserId: userId || null
                });
            }
            const memberObj = members.find((m) => m.user_id === userId);
            setBookings((prev) =>
                prev.map((b) =>
                    b.id === bookingId
                        ? {
                              ...b,
                              assigned_user_id: userId || null,
                              assigned_name: memberObj ? memberObj.name : null
                          }
                        : b
                )
            );
        } catch (err: any) {
            setError(err.message || 'Could not assign team member');
        }
    };

    const handleCreateJob = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newJobForm.customerName.trim()) return;

        const dateStr = newJobForm.date || selectedDate.toISOString().slice(0, 10);
        const startAt = new Date(`${dateStr}T${newJobForm.time || '14:00'}:00`).toISOString();
        const endAt = new Date(new Date(startAt).getTime() + 60 * 60 * 1000).toISOString();
        const memberObj = members.find((m) => m.user_id === newJobForm.assignedUserId);

        const newBooking = {
            id: `disp-demo-${Date.now()}`,
            customer_name: newJobForm.customerName.trim(),
            customer_address: newJobForm.address.trim() || 'Basingstoke, UK',
            start_at: startAt,
            end_at: endAt,
            status: 'scheduled',
            assigned_user_id: newJobForm.assignedUserId || null,
            assigned_name: memberObj ? memberObj.name : null,
            route_sort: selectedDayBookings.length + 1,
            lat: BASINGSTOKE_FALLBACK_COORDS[selectedDayBookings.length % BASINGSTOKE_FALLBACK_COORDS.length].lat,
            lng: BASINGSTOKE_FALLBACK_COORDS[selectedDayBookings.length % BASINGSTOKE_FALLBACK_COORDS.length].lng
        };

        setBookings((prev) => [...prev, newBooking]);
        setShowAssignModal(false);
        setNewJobForm({
            customerName: '',
            address: '',
            time: '14:00',
            assignedUserId: '',
            date: ''
        });
    };

    const selectedDayTitle = selectedDate.toLocaleDateString('en-US', {
        weekday: 'short',
        day: 'numeric',
        month: 'short'
    });

    return (
        <div className="w-full space-y-5">
            {/* 1. Header Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-[26px] font-black tracking-tight text-slate-900">
                        Dispatch
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                        Plan routes, assign jobs and track field activity
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                    {/* Date Range Navigator Pill */}
                    <div className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 shadow-xs">
                        <CalendarIcon className="w-3.5 h-3.5 text-slate-500" />
                        <span>{formatWeekRange(weekStart)}</span>
                        <div className="flex items-center gap-0.5 ml-1 border-l border-slate-200 pl-2">
                            <button
                                type="button"
                                onClick={() =>
                                    setWeekStart((w) => {
                                        const n = new Date(w);
                                        n.setDate(n.getDate() - 7);
                                        return n;
                                    })
                                }
                                className="p-0.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition"
                            >
                                <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <button
                                type="button"
                                onClick={() =>
                                    setWeekStart((w) => {
                                        const n = new Date(w);
                                        n.setDate(n.getDate() + 7);
                                        return n;
                                    })
                                }
                                className="p-0.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition"
                            >
                                <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>

                    {/* Today Button */}
                    <button
                        type="button"
                        onClick={() => {
                            const t = new Date();
                            t.setHours(0, 0, 0, 0);
                            setWeekStart(startOfWeek(t));
                            setSelectedDate(t);
                        }}
                        className="bg-white border border-slate-200 hover:bg-slate-50 active:bg-slate-100 text-slate-700 text-xs font-bold px-4 py-2 rounded-xl shadow-xs transition"
                    >
                        Today
                    </button>

                    {/* Assign Job Button */}
                    <button
                        type="button"
                        onClick={() => setShowAssignModal(true)}
                        className="inline-flex items-center gap-1.5 bg-[#FF8800] hover:bg-[#E67A00] active:bg-[#CC6D00] text-white text-xs font-bold px-4 py-2 rounded-xl shadow-sm transition"
                    >
                        <Plus className="w-4 h-4" /> Assign job
                    </button>
                </div>
            </div>

            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 font-medium">
                    {error}
                </div>
            )}

            {/* 2. Weekly Day Strip (7 Columns) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                {weekDays.map((day) => {
                    const dayBookings = getBookingsForDay(day);
                    const isSelected = day.toDateString() === selectedDate.toDateString();
                    const dayName = day.toLocaleDateString('en-US', { weekday: 'short' });
                    const dayNumber = day.getDate();
                    const count = dayBookings.length;

                    return (
                        <div
                            key={day.toISOString()}
                            onClick={() => setSelectedDate(day)}
                            className={cn(
                                'rounded-2xl p-3.5 min-h-[160px] flex flex-col justify-between transition-all cursor-pointer border select-none',
                                isSelected
                                    ? 'bg-[#FFF9F2] border-[#FDBA74] ring-2 ring-[#FF8800]/20 shadow-xs'
                                    : 'bg-white border-slate-200/90 hover:border-slate-300 shadow-xs'
                            )}
                        >
                            <div>
                                <p
                                    className={cn(
                                        'text-xs font-bold leading-tight',
                                        isSelected ? 'text-[#EA580C]' : 'text-slate-500'
                                    )}
                                >
                                    {dayName}
                                </p>
                                <p
                                    className={cn(
                                        'text-2xl font-black leading-none mt-1 tracking-tight',
                                        isSelected ? 'text-[#EA580C]' : 'text-slate-900'
                                    )}
                                >
                                    {dayNumber}
                                </p>
                                <p className="text-[11px] font-semibold text-slate-400 mt-1">
                                    {count} {count === 1 ? 'job' : 'jobs'}
                                </p>
                            </div>

                            {/* Job Cards in Day Box */}
                            <div className="space-y-1.5 mt-3">
                                {dayBookings.map((b) => {
                                    const timeStr = new Date(b.start_at).toLocaleTimeString('en-GB', {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    });
                                    const isAssigned = Boolean(b.assigned_user_id || b.assigned_name);
                                    const assigneeLabel =
                                        b.assigned_name ||
                                        members.find((m) => m.user_id === b.assigned_user_id)?.name ||
                                        'Unassigned';

                                    return (
                                        <div
                                            key={b.id}
                                            className={cn(
                                                'rounded-xl p-2 text-[11px] border transition',
                                                isSelected
                                                    ? 'bg-white/90 border-amber-200/80 shadow-2xs'
                                                    : 'bg-slate-50 border-slate-200/70'
                                            )}
                                        >
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <span
                                                    className={cn(
                                                        'w-1.5 h-1.5 rounded-full shrink-0',
                                                        isAssigned ? 'bg-emerald-500' : 'bg-orange-500'
                                                    )}
                                                />
                                                <span className="font-bold text-slate-900 shrink-0">
                                                    {timeStr}
                                                </span>
                                                <span className="font-bold text-slate-900 truncate">
                                                    {b.customer_name}
                                                </span>
                                            </div>
                                            <p
                                                className={cn(
                                                    'text-[10px] font-semibold mt-0.5 pl-3 truncate',
                                                    isAssigned ? 'text-emerald-700' : 'text-slate-500'
                                                )}
                                            >
                                                {assigneeLabel}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* 3. Bottom Two-Column Split: Route Map & Day's Jobs */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* Left Card: Route Map */}
                <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center border border-orange-100 shrink-0">
                                <MapPin className="w-4 h-4 text-orange-600" />
                            </div>
                            <div>
                                <h2 className="font-bold text-base text-slate-900 leading-tight">Route Map</h2>
                                <p className="text-xs text-slate-500">Visualise and optimise your day&apos;s route</p>
                            </div>
                        </div>

                        <a
                            href={googleMapsRouteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-bold text-[#FF8800] hover:text-[#E67A00] transition shrink-0"
                        >
                            Open in Google Maps <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                    </div>

                    {/* Google Map View */}
                    <div className="rounded-xl overflow-hidden border border-slate-200 shadow-2xs">
                        <PlacesMap
                            markers={mapMarkers}
                            height={340}
                            showPlaceholder
                            title="Dispatch Route"
                            placeholder={
                                mapsJsConfigured()
                                    ? 'Loading route locations on the map…'
                                    : 'Google Map preview is currently in demo mode.'
                            }
                        />
                    </div>
                </div>

                {/* Right Card: Jobs for Selected Day */}
                <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="font-bold text-base text-slate-900">
                            Jobs for {selectedDayTitle}
                        </h2>
                        <span className="text-xs font-bold text-slate-400">
                            {selectedDayBookings.length} {selectedDayBookings.length === 1 ? 'job' : 'jobs'}
                        </span>
                    </div>

                    <div className="space-y-3">
                        {!selectedDayBookings.length ? (
                            <div className="py-12 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 space-y-2">
                                <Navigation className="w-8 h-8 text-slate-300 mx-auto" />
                                <p className="text-sm font-bold text-slate-700">No jobs on this day</p>
                                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                                    There are no appointments or field jobs scheduled for {selectedDayTitle}.
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setShowAssignModal(true)}
                                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-50 text-orange-600 border border-orange-200 text-xs font-bold hover:bg-orange-100 transition"
                                >
                                    <Plus className="w-3.5 h-3.5" /> Assign job
                                </button>
                            </div>
                        ) : (
                            selectedDayBookings.map((b, idx) => {
                                const timeStr = new Date(b.start_at).toLocaleTimeString('en-GB', {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                });
                                const isAssigned = Boolean(b.assigned_user_id || b.assigned_name);
                                const assigneeLabel =
                                    b.assigned_name ||
                                    members.find((m) => m.user_id === b.assigned_user_id)?.name ||
                                    'Unassigned';

                                return (
                                    <div
                                        key={b.id}
                                        className="rounded-2xl border border-slate-200 p-4 hover:border-slate-300 transition-colors shadow-2xs flex items-start justify-between gap-3 relative"
                                    >
                                        <div className="flex items-start gap-3.5 min-w-0">
                                            {/* Stop Number in Orange */}
                                            <span className="font-black text-lg text-[#EA580C] leading-none pt-0.5 shrink-0">
                                                {idx + 1}
                                            </span>

                                            <div className="min-w-0">
                                                {/* Time & Customer Name */}
                                                <div className="flex items-baseline gap-2">
                                                    <span className="font-black text-sm text-slate-900">
                                                        {timeStr}
                                                    </span>
                                                    <span className="font-bold text-sm text-slate-900 truncate">
                                                        {b.customer_name}
                                                    </span>
                                                </div>

                                                {/* Address */}
                                                <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                                                    <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                                                    <span className="truncate">
                                                        {b.customer_address || 'uk 9378'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right Controls: Status Badge + 3-dots */}
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span
                                                className={cn(
                                                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border',
                                                    isAssigned
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                        : 'bg-slate-100 text-slate-600 border-slate-200'
                                                )}
                                            >
                                                <span
                                                    className={cn(
                                                        'w-1.5 h-1.5 rounded-full',
                                                        isAssigned ? 'bg-emerald-500' : 'bg-slate-400'
                                                    )}
                                                />
                                                {assigneeLabel}
                                            </span>

                                            <div className="relative">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setActiveActionBookingId(
                                                            activeActionBookingId === b.id ? null : b.id
                                                        )
                                                    }
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                                                >
                                                    <MoreVertical className="w-4 h-4" />
                                                </button>

                                                {activeActionBookingId === b.id && (
                                                    <div className="absolute right-0 mt-1 w-48 rounded-2xl bg-white border border-slate-200 shadow-xl p-2 z-50 text-xs text-slate-800 space-y-1">
                                                        <p className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                            Assign Team Member
                                                        </p>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleAssignTeamMember(b.id, '')}
                                                            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-50 font-medium text-slate-600"
                                                        >
                                                            Unassign
                                                        </button>
                                                        {members.map((m) => (
                                                            <button
                                                                key={m.user_id}
                                                                type="button"
                                                                onClick={() => handleAssignTeamMember(b.id, m.user_id)}
                                                                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-orange-50 hover:text-orange-700 font-medium flex items-center justify-between"
                                                            >
                                                                <span>{m.name}</span>
                                                                {b.assigned_user_id === m.user_id && (
                                                                    <UserCheck className="w-3.5 h-3.5 text-orange-600" />
                                                                )}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* Modal: Assign / New Job */}
            {showAssignModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
                    <form
                        onSubmit={handleCreateJob}
                        className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 w-full max-w-md space-y-4 shadow-2xl relative"
                    >
                        <button
                            type="button"
                            onClick={() => setShowAssignModal(false)}
                            className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div>
                            <h2 className="text-lg font-black text-slate-900 tracking-tight">Assign Field Job</h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Schedule and dispatch a booking to a team member.
                            </p>
                        </div>

                        <div className="space-y-3 pt-1">
                            <label className="block text-xs font-bold text-slate-700">
                                Customer Name *
                                <input
                                    required
                                    value={newJobForm.customerName}
                                    onChange={(e) =>
                                        setNewJobForm((prev) => ({ ...prev, customerName: e.target.value }))
                                    }
                                    placeholder="e.g. Robert Kim"
                                    className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                                />
                            </label>

                            <label className="block text-xs font-bold text-slate-700">
                                Service Address
                                <input
                                    value={newJobForm.address}
                                    onChange={(e) =>
                                        setNewJobForm((prev) => ({ ...prev, address: e.target.value }))
                                    }
                                    placeholder="e.g. 57 Brackley way, Basingstoke"
                                    className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                                />
                            </label>

                            <div className="grid grid-cols-2 gap-3">
                                <label className="block text-xs font-bold text-slate-700">
                                    Date
                                    <input
                                        type="date"
                                        value={newJobForm.date || selectedDate.toISOString().slice(0, 10)}
                                        onChange={(e) =>
                                            setNewJobForm((prev) => ({ ...prev, date: e.target.value }))
                                        }
                                        className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                                    />
                                </label>

                                <label className="block text-xs font-bold text-slate-700">
                                    Time
                                    <input
                                        type="time"
                                        value={newJobForm.time}
                                        onChange={(e) =>
                                            setNewJobForm((prev) => ({ ...prev, time: e.target.value }))
                                        }
                                        className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                                    />
                                </label>
                            </div>

                            <label className="block text-xs font-bold text-slate-700">
                                Assign Team Member
                                <select
                                    value={newJobForm.assignedUserId}
                                    onChange={(e) =>
                                        setNewJobForm((prev) => ({ ...prev, assignedUserId: e.target.value }))
                                    }
                                    className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold bg-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                                >
                                    <option value="">Unassigned</option>
                                    {members.map((m) => (
                                        <option key={m.user_id} value={m.user_id}>
                                            {m.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <div className="flex gap-2.5 pt-3 border-t border-slate-100 justify-end">
                            <button
                                type="button"
                                onClick={() => setShowAssignModal(false)}
                                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-5 py-2.5 rounded-xl bg-[#FF8800] hover:bg-[#E67A00] text-white text-xs font-bold shadow-sm transition"
                            >
                                Save & Dispatch
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
