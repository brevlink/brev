import { useState } from 'react';
import { deleteLink } from '../api/client';
import { button } from '../styles/ui';

export default function LinkCard({ link, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleDelete() {
    if (!window.confirm('Delete this link? Redirects will stop working.')) return;
    setDeleting(true);
    try {
      await deleteLink(link.id);
      onDeleted?.(link.id);
    } catch {
      setDeleting(false);
    }
  }

  async function copyToClipboard() {
    await navigator.clipboard.writeText(link.short_url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  const created = new Date(link.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <article className="grid grid-cols-[minmax(0,1fr)_auto] gap-[18px] rounded-3xl border border-[rgba(7,25,54,0.14)] bg-[rgba(255,250,241,0.46)] p-[22px] max-[840px]:grid-cols-1 max-[520px]:rounded-[22px] max-[520px]:p-[18px]">
      <div>
        <div>
          <a
            href={link.short_url}
            target="_blank"
            rel="noreferrer"
            className="inline-block max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-['JetBrains_Mono',ui-monospace,monospace] font-extrabold text-[#071936]"
          >
            {link.short_url}
          </a>
          <p className="mt-2 mb-0 [overflow-wrap:anywhere] text-[#38516f]">{link.url}</p>
        </div>
        {link.title && (
          <span className="mt-3 inline-flex w-fit rounded-full border border-[rgba(7,25,54,0.14)] px-2.5 py-1.5 text-[0.82rem] text-[#38516f]">
            {link.title}
          </span>
        )}
      </div>

      <div className="col-start-1 flex flex-wrap gap-2.5 text-[0.84rem] text-[#38516f] max-[840px]:col-auto max-[840px]:row-auto max-[840px]:justify-start">
        <span>{link.clicks || 0} clicks</span>
        <span>Created {created}</span>
        <span>{link.is_active ? 'Active' : 'Paused'}</span>
      </div>

      <div className="col-start-2 row-span-2 row-start-1 flex flex-wrap content-start justify-end gap-2.5 max-[840px]:col-auto max-[840px]:row-auto max-[840px]:justify-start">
        <button type="button" className={button.compactSecondary} onClick={copyToClipboard}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className={button.compactDanger} onClick={handleDelete} disabled={deleting}>
          {deleting ? 'Deleting' : 'Delete'}
        </button>
      </div>
    </article>
  );
}
