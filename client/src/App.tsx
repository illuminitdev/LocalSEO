import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './shared/Layout';
import { RequireAuth, RequireAdmin } from './shared/AuthGuards';
import FeatureGate from './shared/FeatureGate';
import Dashboard from './features/dashboard/Dashboard';
import ProfileAudit from './features/local-presence/ProfileAudit';
import PostAutomation from './features/local-presence/PostAutomation';
import { ReviewManagement, QAAutoResponder } from './features/local-presence/ReviewsAndQA';
import RankTracker from './features/visibility/RankTracker';
import VisibilityAuditReport from './features/visibility/VisibilityAuditReport';
import MediaOptimization from './features/local-presence/MediaOptimization';
import ReportGenerator from './features/report/ReportGenerator';
import Citations from './features/local-presence/Citations';
import BookingPlots from './features/bookings/BookingPlots';
import PublicBookHost, { PublicBookEvent, BookSuccess, BookManage } from './features/bookings/PublicBooking';
import Login from './features/auth/Login';
import { ForgotPassword, ResetPassword } from './features/auth/PasswordReset';
import Account from './features/account/Account';
import { Privacy, Terms } from './features/auth/Legal';
import AdminDashboard from './features/admin/AdminDashboard';
import AdminUsers from './features/admin/AdminUsers';
import AdminUserDetail from './features/admin/AdminUserDetail';
import AdminServices from './features/admin/AdminServices';
import AdminSettings from './features/admin/AdminSettings';
import AdminGrowthAuditLeads from './features/admin/AdminGrowthAuditLeads';
import AdminLayout from './features/admin/AdminLayout';

/** Old /booking/settings URL → /booking?panel=settings */
function BookingSettingsRedirect() {
  const location = useLocation();
  const search = location.search.replace(/^\?/, '');
  const params = new URLSearchParams(search);
  params.set('panel', 'settings');
  return <Navigate to={`/booking?${params.toString()}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/login" element={<Navigate to="/" replace />} />
        <Route
          element={
            <RequireAdmin>
              <AdminLayout />
            </RequireAdmin>
          }
        >
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/users/:kind/:id" element={<AdminUserDetail />} />
          <Route path="/admin/growth-audit-leads" element={<AdminGrowthAuditLeads />} />
          <Route path="/admin/services" element={<AdminServices />} />
          <Route path="/admin/settings" element={<AdminSettings />} />
        </Route>
        {/* Always show login on / and /login — do not auto-jump to last dashboard/admin.
            Refresh on /dashboard or /admin still stays logged in via RequireAuth / RequireAdmin. */}
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Navigate to="/" replace />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/book/success" element={<BookSuccess />} />
        <Route path="/book/manage/:token" element={<BookManage />} />
        <Route path="/book/:hostSlug/:eventSlug" element={<PublicBookEvent />} />
        <Route path="/book/:hostSlug" element={<PublicBookHost />} />
        <Route path="/book" element={<Navigate to="/booking" replace />} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/account" element={<Account />} />
          <Route path="/booking/settings" element={<FeatureGate feature="bookings"><BookingSettingsRedirect /></FeatureGate>} />
          <Route path="/profile" element={<FeatureGate feature="local_presence"><ProfileAudit /></FeatureGate>} />
          <Route path="/posts" element={<FeatureGate feature="local_presence"><PostAutomation /></FeatureGate>} />
          <Route path="/reviews" element={<FeatureGate feature="local_presence"><ReviewManagement /></FeatureGate>} />
          <Route path="/qa" element={<FeatureGate feature="local_presence"><QAAutoResponder /></FeatureGate>} />
          <Route path="/rank-tracker" element={<FeatureGate feature="local_growth"><RankTracker /></FeatureGate>} />
          <Route path="/visibility-audit/report" element={<VisibilityAuditReport />} />
          <Route path="/media" element={<FeatureGate feature="local_presence"><MediaOptimization /></FeatureGate>} />
          <Route path="/report" element={<FeatureGate features={['local_growth', 'reporting']}><ReportGenerator /></FeatureGate>} />
          <Route path="/citations" element={<FeatureGate feature="local_presence"><Citations /></FeatureGate>} />
          <Route path="/booking" element={<FeatureGate feature="bookings"><BookingPlots /></FeatureGate>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
