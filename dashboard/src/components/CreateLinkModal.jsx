import { useState } from 'react';

const BACKEND_URL = import.meta.env.VITE_API_URL || '';

export default function CreateLinkModal({ open, onClose, onCreated }) {
  const [url, setUrl] = useState('');
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);

    try {
      const token = localStorage.getItem('brev_token');
      const res = await fetch(BACKEND_URL + '/api/v1/links', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url, slug: slug || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to create link');
      setResult(data);
      onCreated?.(data);
      setTimeout(() => {
        setUrl('');
        setSlug('');
        setResult(null);
        onClose();
      }, 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="glass rounded-2xl p-8 glow w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Create short link</h2>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors text-xl leading-none">✕</button>
        </div>

        {result ? (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-2xl bg-green-400/10 flex items-center justify-center mx-auto mb-4 text-2xl">✓</div>
            <p className="text-lg font-semibold mb-1">Link created!</p>
            <p className="text-sm text-white/50 font-mono break-all">{result.short_url}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="text-sm text-red-400 bg-red-400/10 rounded-lg px-4 py-2.5 border border-red-400/20">{error}</div>
            )}

            <div>
              <label className="block text-sm font-medium text-white/60 mb-1.5">Destination URL</label>
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://example.com/very/long/url"
                className="input-dark w-full rounded-xl px-4 py-3 text-sm"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white/60 mb-1.5">
                Custom slug <span className="text-white/30">(optional)</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-white/30 font-mono shrink-0">brevl.ink/</span>
                <input
                  type="text"
                  value={slug}
                  onChange={e => setSlug(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                  placeholder="my-link"
                  className="input-dark flex-1 rounded-xl px-4 py-3 text-sm font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition-all disabled:opacity-50"
            >
              {loading ? 'Creating…' : 'Create link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}