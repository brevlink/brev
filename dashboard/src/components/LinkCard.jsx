import { useId, useRef, useState } from 'react';
import { deleteLink, updateLink } from '../api/client';
import { alert, button, field, fieldLabel, formStack, input, status } from '../styles/ui';

export default function LinkCard({ link: sourceLink, onDeleted, onUpdated }) {
  const [saved, setSaved] = useState(null);
  // Keep standalone cards usable while allowing the parent to supply fresh data.
  const link = saved?.source === sourceLink ? saved.value : sourceLink;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ url: '', title: '' });
  const [pending, setPending] = useState('');
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [deleted, setDeleted] = useState(false);
  // State disables buttons after rendering; refs also stop repeated events before that render.
  const actionRef = useRef(false);
  const copyRef = useRef(false);
  const fieldId = useId();

  function startEdit() {
    setForm({ url: link.url, title: link.title || '' });
    setError('');
    setMessage('');
    setEditing(true);
  }

  async function saveChanges(event) {
    event.preventDefault();
    await handleUpdate({ url: form.url, title: form.title || null }, 'saving', 'Changes saved.');
  }

  async function handleUpdate(changes, action, success) {
    if (actionRef.current || copyRef.current) return;
    actionRef.current = true;
    setPending(action);
    setError('');
    setMessage('');
    try {
      const updated = await updateLink(link.id, changes);
      setSaved({ source: sourceLink, value: updated });
      setEditing(false);
      setMessage(success);
      onUpdated?.(updated);
    } catch (err) {
      setError(err.message || 'Could not update this link. Please try again.');
    } finally {
      actionRef.current = false;
      setPending('');
    }
  }

  async function handleDelete() {
    if (actionRef.current || copyRef.current) return;
    if (!window.confirm('Delete this link? Redirects will stop working.')) return;
    actionRef.current = true;
    setPending('deleting');
    setError('');
    setMessage('');
    try {
      await deleteLink(link.id);
      setDeleted(true);
      onDeleted?.(link.id);
    } catch (err) {
      setError(err.message || 'Could not delete this link. Please try again.');
    } finally {
      actionRef.current = false;
      setPending('');
    }
  }

  async function copyToClipboard() {
    if (copyRef.current || actionRef.current) return;
    copyRef.current = true;
    setCopying(true);
    setError('');
    setMessage('');
    try {
      await navigator.clipboard.writeText(link.short_url);
      setMessage('Link copied.');
    } catch {
      setError('Could not copy the link. Select the short URL and copy it manually.');
    } finally {
      copyRef.current = false;
      setCopying(false);
    }
  }

  if (deleted) return <p role="status" className={status.good}>Link deleted.</p>;

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
          <span className="mt-3 inline-flex w-fit max-w-full rounded-full border border-[rgba(7,25,54,0.14)] [overflow-wrap:anywhere] px-2.5 py-1.5 text-[0.82rem] text-[#38516f]">
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
        <button type="button" className={button.compactSecondary} onClick={copyToClipboard} disabled={copying || Boolean(pending)}>
          {copying ? 'Copying' : 'Copy'}
        </button>
        <button type="button" className={button.compactSecondary} onClick={startEdit} disabled={Boolean(pending) || copying || editing}>Edit</button>
        <button
          type="button"
          className={button.compactSecondary}
          disabled={Boolean(pending) || copying || editing}
          onClick={() => handleUpdate({ is_active: !link.is_active }, 'activity', link.is_active ? 'Link paused. Redirects are stopped.' : 'Link resumed. Redirects are working.')}
        >
          {pending === 'activity' ? (link.is_active ? 'Pausing' : 'Resuming') : (link.is_active ? 'Pause' : 'Resume')}
        </button>
        <button type="button" className={button.compactDanger} onClick={handleDelete} disabled={Boolean(pending) || copying || editing}>
          {pending === 'deleting' ? 'Deleting' : 'Delete'}
        </button>
      </div>
      {editing && (
        <form className={`${formStack} col-span-full mt-0`} onSubmit={saveChanges}>
          <div className={field}>
            <label className={fieldLabel} htmlFor={`${fieldId}-url`}>Destination URL</label>
            <input id={`${fieldId}-url`} className={input} type="url" required autoFocus value={form.url} disabled={Boolean(pending)} onChange={event => setForm(current => ({ ...current, url: event.target.value }))} />
          </div>
          <div className={field}>
            <label className={fieldLabel} htmlFor={`${fieldId}-title`}>Title</label>
            <input id={`${fieldId}-title`} className={input} maxLength={256} value={form.title} disabled={Boolean(pending)} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} />
          </div>
          <p className="m-0 text-sm text-[#38516f]">Your short URL stays the same.</p>
          <div className="flex flex-wrap gap-2.5">
            <button className={button.primary} type="submit" disabled={Boolean(pending)}>{pending === 'saving' ? 'Saving' : 'Save changes'}</button>
            <button className={button.secondary} type="button" disabled={Boolean(pending)} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      )}
      {error && <div className={`${alert} col-span-full`} role="alert">{error}</div>}
      {message && <p className={`${status.good} col-span-full m-0 whitespace-normal`} role="status">{message}</p>}
    </article>
  );
}
