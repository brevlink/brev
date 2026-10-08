import { Navigate, useLocation } from 'react-router-dom';

export default function DashboardRedirect() {
  const { hash, search } = useLocation();
  const legacy = {
    '#links': 'links',
    '#domains': 'domains',
    '#billing': 'account',
    '#api-keys': 'account',
  };
  // Checkout returns can use the original dashboard URL without a fragment.
  const section =
    legacy[hash] ||
    (new URLSearchParams(search).has('billing') ? 'account' : 'links');
  return (
    <Navigate to={{ pathname: `/dashboard/${section}`, search }} replace />
  );
}
