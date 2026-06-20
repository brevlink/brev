import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import LinkCard from '../components/LinkCard';
import CreateLinkModal from '../components/CreateLinkModal';
import { me } from '../api/client';

export default function Dashboard() {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [user, setUser] = useState(null);
  const [filter, setFilter] = useState('');

  async function loadLinks() {
    try {
      const token = localStorage.getItem('brev_token');
      const res = await fetch('/api/v1/links', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setLinks(Array.isArray(data) ? data : data.links || []);
    } catch {
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    me().then(setUser).catch(() => {});
    loadLinks();
  }, []);

  function handleDeleted(slug) {
    setLinks(prev => prev.filter(l => l.slug !== slug));
  }

  function handleCreated(link) {
    setLinks(prev => [link, ...prev]);
  }

  const filtered = filter
    ? links.filter(l =>
        l.short_url?.includes(filter) ||
        l.original_url?.includes(filter) ||
        l.slug?.includes(filter)
      )
    : links;

  const totalClicks = links.reduce((sum, l) => sum + (l.click_count || 0), 0);

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">My Links</h1>
          <p className="text-sm text-white/40 mt-1">
            {links.length} link{links.length !== 1 ? 's' : ''} · {totalClicks} total click{totalClicks !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
        >
          + New link
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          ['🔗', 'Total links', links.length],
          ['👆', 'Total clicks', totalClicks],
          ['📅', 'Joined', user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—'],
        ].map(([icon, label, value]) => (
          <div key={label} className="glass rounded-2xl p-5">
            <div className="text-2xl mb-2">{icon}</div>
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-xs text-white/40 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Search links…"
          className="input-dark w-full max-w-md rounded-xl px-4 py-2.5 text-sm"
        />
      </div>

      {/* Link list */}
      {loading ? (
        <div className="text-center py-16 text-white/30">Loading links…</div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <div className="text-4xl mb-4">🔗</div>
          <h3 className="text-lg font-semibold mb-2">{filter ? 'No matching links' : 'No links yet'}</h3>
          <p className="text-sm text-white/40 mb-6">
            {filter ? 'Try a different search term.' : 'Create your first short link to get started.'}
          </p>
          {!filter && (
            <button
              onClick={() => setShowCreate(true)}
              className="btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
            >
              + Create your first link
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(link => (
            <LinkCard key={link.slug || link.id} link={link} onDeleted={handleDeleted} />
          ))}
        </div>
      )}

      <CreateLinkModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
      />
    </Layout>
  );
}