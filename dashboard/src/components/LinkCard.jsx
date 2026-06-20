import { useState } from 'react';

const BACKEND_URL = import.meta.env.VITE_API_URL || '';

export default function LinkCard({ link, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleDelete() {
    if (!confirm('Delete this link? Redirects will stop working.')) return;
    setDeleting(true);
    try {
      const token = localStorage.getItem('brev_token');
      const res = await fetch(BACKEND_URL + `/api/v1/links/${link.slug}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Delete failed');
      onDeleted?.(link.slug);
    } catch {
      setDeleting(false);
    }
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(link.short_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement('input');
      input.value = link.short_url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const created = new Date(link.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="glass rounded-2xl p-5 hover:bg-white/[0.04] transition-all duration-200">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sm font-mono text-[#3b82f6] font-medium truncate">{link.short_url}</span>
            <button
              onClick={copyToClipboard}
              className="shrink-0 px-2 py-0.5 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-xs text-white/40 hover:text-white transition-all"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-sm text-white/40 truncate mb-3">{link.original_url}</p>
          <div className="flex items-center gap-4 text-xs text-white/30">
            <span>Created {created}</span>
            <span className="flex items-center gap-1">
              <span className="text-green-400">●</span>
              {link.click_count || 0} clicks
            </span>
          </div>
        </div>

        <button
          onClick={handleDelete}
          disabled={deleting}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-red-400/5 text-red-400/50 hover:text-red-400 hover:bg-red-400/10 text-xs font-medium transition-all disabled:opacity-30"
        >
          {deleting ? '…' : 'Delete'}
        </button>
      </div>
    </div>
  );
}