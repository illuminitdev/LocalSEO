import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
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
import Register from './pages/Register';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/book/success" element={<BookSuccess />} />
        <Route path="/book/manage/:token" element={<BookManage />} />
        <Route path="/book/:hostSlug/:eventSlug" element={<PublicBookEvent />} />
        <Route path="/book/:hostSlug" element={<PublicBookHost />} />
        <Route path="/book" element={<Navigate to="/booking" replace />} />
        <Route path="/booking/settings" element={<BookingSettings />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/profile" element={<ProfileAudit />} />
          <Route path="/posts" element={<PostAutomation />} />
          <Route path="/reviews" element={<ReviewManagement />} />
          <Route path="/qa" element={<QAAutoResponder />} />
          <Route path="/rank-tracker" element={<RankTracker />} />
          <Route path="/media" element={<MediaOptimization />} />
          <Route path="/report" element={<ReportGenerator />} />
          <Route path="/citations" element={<Citations />} />
          <Route path="/booking" element={<BookingPlots />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
