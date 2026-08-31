import { Navigate, useLocation } from 'react-router-dom';

export default function BookingSettings() {
    const location = useLocation();
    const search = location.search.replace(/^\?/, '');
    const params = new URLSearchParams(search);
    params.set('panel', 'settings');
    return <Navigate to={`/booking?${params.toString()}`} replace />;
}
