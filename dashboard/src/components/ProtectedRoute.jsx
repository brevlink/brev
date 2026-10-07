import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { me } from '../api/client';

export default function ProtectedRoute({ children, adminOnly = false }) {
  const [state, setState] = useState({ loading: true, authenticated: false, isAdmin: false });

  useEffect(() => {
    let cancelled = false;
    me()
      .then(user => {
        if (!cancelled) setState({ loading: false, authenticated: true, isAdmin: user.is_admin });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, authenticated: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.loading) {
    return <div className="grid min-h-screen place-items-center p-6">Loading</div>;
  }

  if (!state.authenticated) {
    return <Navigate to="/login" replace />;
  }

  // Check the server's user record before mounting a page that loads admin data.
  if (adminOnly && !state.isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
