import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { me } from '../api/client';

export default function ProtectedRoute({ children }) {
  const [state, setState] = useState({ loading: true, authenticated: false });

  useEffect(() => {
    let cancelled = false;
    me()
      .then(() => {
        if (!cancelled) setState({ loading: false, authenticated: true });
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

  return children;
}
