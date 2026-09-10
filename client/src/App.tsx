import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './shared/Layout';
import { RequireAuth, RequireAdmin, RequireSales } from './shared/AuthGuards';
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
import ClientPortal from './features/bookings/ClientPortal';
import { ClientsListPage, ClientDetailPage } from './features/clients/Clients';
import { QuotesListPage, QuoteNewPage, QuoteDetailPage } from './features/quotes/Quotes';
import PublicQuote from './features/quotes/PublicQuote';
import Inbox from './features/inbox/Inbox';
import Team from './features/team/Team';
import TeamAccept from './features/team/TeamAccept';
import Dispatch from './features/dispatch/Dispatch';
import MoneyDashboard from './features/money/MoneyDashboard';
import Marketing from './features/marketing/Marketing';
import PublicSite from './features/marketing/PublicSite';
import Field from './features/field/Field';
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
import AdminCrmTasks from './features/admin/AdminCrmTasks';
import AdminFullAudits from './features/admin/AdminFullAudits';
import AdminFullAuditNew from './features/admin/AdminFullAuditNew';
import AdminFullAuditDetail from './features/admin/AdminFullAuditDetail';
import AdminLayout from './features/admin/AdminLayout';
import SalesLayout from './features/sales/SalesLayout';
import SalesQueue from './features/sales/SalesQueue';
import SalesLeadDetail from './features/sales/SalesLeadDetail';
import SalesAccount from './features/sales/SalesAccount';

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
          <Route path="/admin/full-audits" element={<AdminFullAudits />} />
          <Route path="/admin/full-audits/new" element={<AdminFullAuditNew />} />
          <Route path="/admin/full-audits/:id" element={<AdminFullAuditDetail />} />
          <Route path="/admin/tasks" element={<AdminCrmTasks />} />
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
        <Route path="/book/portal/:token" element={<ClientPortal />} />
        <Route path="/quote/:token" element={<PublicQuote />} />
        <Route path="/s/:orgSlug" element={<PublicSite />} />
        <Route path="/team/accept" element={<RequireAuth><TeamAccept /></RequireAuth>} />
        <Route path="/book/:hostSlug/:eventSlug" element={<PublicBookEvent />} />
        <Route path="/book/:hostSlug" element={<PublicBookHost />} />
        <Route path="/book" element={<Navigate to="/booking" replace />} />
        <Route
          element={
            <RequireSales>
              <SalesLayout />
            </RequireSales>
          }
        >
          <Route path="/sales" element={<SalesQueue />} />
          <Route path="/sales/leads/:id" element={<SalesLeadDetail />} />
          <Route path="/sales/account" element={<SalesAccount />} />
        </Route>
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
          <Route path="/clients" element={<FeatureGate feature="bookings"><ClientsListPage /></FeatureGate>} />
          <Route path="/clients/:id" element={<FeatureGate feature="bookings"><ClientDetailPage /></FeatureGate>} />
          <Route path="/quotes" element={<FeatureGate feature="bookings"><QuotesListPage /></FeatureGate>} />
          <Route path="/quotes/new" element={<FeatureGate feature="bookings"><QuoteNewPage /></FeatureGate>} />
          <Route path="/quotes/:id" element={<FeatureGate feature="bookings"><QuoteDetailPage /></FeatureGate>} />
          <Route path="/inbox" element={<FeatureGate feature="bookings"><Inbox /></FeatureGate>} />
          <Route path="/team" element={<FeatureGate feature="bookings"><Team /></FeatureGate>} />
          <Route path="/dispatch" element={<FeatureGate feature="bookings"><Dispatch /></FeatureGate>} />
          <Route path="/money" element={<FeatureGate feature="bookings"><MoneyDashboard /></FeatureGate>} />
          <Route path="/marketing" element={<FeatureGate feature="bookings"><Marketing /></FeatureGate>} />
          <Route path="/field" element={<FeatureGate feature="bookings"><Field /></FeatureGate>} />
          <Route path="/field/:bookingId" element={<FeatureGate feature="bookings"><Field /></FeatureGate>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
