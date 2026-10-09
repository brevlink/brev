import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import AdminPage from './pages/AdminPage';
import Dashboard from './pages/Dashboard';
import DashboardRedirect from './pages/DashboardRedirect';
import StatsPage from './pages/StatsPage';
import LinksPage from './pages/LinksPage';
import DomainsPage from './pages/DomainsPage';
import AccountPage from './pages/AccountPage';
import InviteAccept from './pages/InviteAccept';
import Login from './pages/Login';
import Report from './pages/Report';
import Register from './pages/Register';
import ResetPassword from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';

function routerBaseName() {
  return window.location.pathname.startsWith('/app') ? '/app' : undefined;
}

export default function App() {
  return (
    <BrowserRouter basename={routerBaseName()}>
      <div className="app-surface min-h-screen font-sans text-ink antialiased">
        <Routes>
          <Route path="/report" element={<Report />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          {/* Both are targets of emails the backend sends, so both must be real
              routes: their URLs go in FRONTEND_VERIFICATION_URL and
              FRONTEND_PASSWORD_RESET_URL. */}
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          {/* Target of the invitation email the backend sends, so its URL goes in
              FRONTEND_DOMAIN_INVITE_URL. */}
          <Route path="/invites/accept" element={<InviteAccept />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardRedirect />} />
            <Route path="links" element={<LinksPage />} />
            <Route path="stats" element={<StatsPage />} />
            <Route path="stats/:slug" element={<StatsPage />} />
            <Route path="domains" element={<DomainsPage />} />
            <Route path="account" element={<AccountPage />} />
            <Route path="*" element={<DashboardRedirect />} />
          </Route>
          <Route
            path="/admin"
            element={
              <ProtectedRoute adminOnly>
                <AdminPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
