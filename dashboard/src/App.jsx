import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Register from './pages/Register';

function routerBaseName() {
  return window.location.pathname.startsWith('/app') ? '/app' : undefined;
}

export default function App() {
  return (
    <BrowserRouter basename={routerBaseName()}>
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(217,197,165,0.7),transparent_34rem),linear-gradient(135deg,#f8f1e6_0%,#efe6d4_54%,#e3d2b7_100%)] font-['Inter',ui-sans-serif,system-ui,sans-serif] text-[#071936] antialiased">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
