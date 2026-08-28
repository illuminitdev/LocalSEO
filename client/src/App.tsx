import { BrowserRouter, Route, Routes } from 'react-router-dom';
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
import PublicBook from './pages/PublicBook';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/book" element={<PublicBook />} />
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
