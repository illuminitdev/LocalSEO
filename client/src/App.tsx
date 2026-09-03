import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import RequireAuth from './components/RequireAuth';
import RedirectIfAuthed from './components/RedirectIfAuthed';
import FeatureGate from './components/FeatureGate';
import Dashboard from './pages/Dashboard';
import ProfileAudit from './pages/ProfileAudit';
import PostAutomation from './pages/PostAutomation';
import ReviewManagement from './pages/ReviewManagement';
import QAAutoResponder from './pages/QAAutoResponder';
import RankTracker from './pages/RankTracker';
import MediaOptimization from './pages/MediaOptimization';
import ReportGenerator from './pages/ReportGenerator';
import Citations from './pages/Citations';
import BookingPlots from './pages/BookingPlots';
import BookingSettings from './pages/BookingSettings';
import PublicBookHost, { PublicBookEvent } from './pages/PublicBook';
import BookSuccess from './pages/BookSuccess';
import BookManage from './pages/BookManage';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Account from './pages/Account';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminServices from './pages/admin/AdminServices';
import AdminLayout from './components/AdminLayout';
import RequireAdmin from './components/RequireAdmin';

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
          <Route path="/admin/services" element={<AdminServices />} />
        </Route>
        <Route path="/" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
        <Route path="/login" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
        <Route path="/register" element={<Navigate to="/" replace />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/forgot-password" element={<RedirectIfAuthed><ForgotPassword /></RedirectIfAuthed>} />
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
          <Route path="/booking/settings" element={<FeatureGate feature="bookings"><BookingSettings /></FeatureGate>} />
          <Route path="/profile" element={<FeatureGate feature="local_presence"><ProfileAudit /></FeatureGate>} />
          <Route path="/posts" element={<FeatureGate feature="local_presence"><PostAutomation /></FeatureGate>} />
          <Route path="/reviews" element={<FeatureGate feature="local_presence"><ReviewManagement /></FeatureGate>} />
          <Route path="/qa" element={<FeatureGate feature="local_presence"><QAAutoResponder /></FeatureGate>} />
          <Route path="/rank-tracker" element={<FeatureGate feature="local_growth"><RankTracker /></FeatureGate>} />
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
