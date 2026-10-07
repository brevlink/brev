import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdminLinks, getAdminUsers } from '../api/client';
import AdminPanel from '../components/AdminPanel';
import Layout from '../components/Layout';
import { alert, button, eyebrow, muted, serif } from '../styles/ui';

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([getAdminUsers(), getAdminLinks()])
      .then(([usersData, linksData]) => {
        if (cancelled) return;
        setUsers(usersData.items || []);
        setLinks(linksData || []);
      })
      .catch(err => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Layout>
      <header className="flex items-start justify-between gap-6 max-[520px]:flex-col">
        <div>
          <p className={eyebrow}>Admin</p>
          <h1 className={`${serif} m-0 text-[clamp(2.6rem,8vw,5.2rem)] leading-[0.88]`}>Administration.</h1>
          <p className={muted}>Manage users, Cloud access, and link moderation.</p>
        </div>
        <Link to="/dashboard" className={button.secondary}>Back to dashboard</Link>
      </header>
      {error && <p role="alert" className={alert}>{error}</p>}
      {loading ? (
        <p className={muted}>Loading admin data</p>
      ) : !error && (
        <AdminPanel users={users} links={links} onUsersChange={setUsers} onLinksChange={setLinks} />
      )}
    </Layout>
  );
}
