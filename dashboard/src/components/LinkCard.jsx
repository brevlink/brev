import { Alert, Button, DataRow, FieldInput, FormStack, MonoValue, Note, RowActions, StatusBadge, TitleBadge } from './ui';
import { useId, useRef, useState } from 'react';
import { deleteLink, updateLink } from '../api/client';

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
    await handleUpdate(
      { url: form.url, title: form.title || null },
      'saving',
      'Changes saved.',
    );
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
    if (!window.confirm('Delete this link? Redirects will stop working.'))
      return;
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
      setError(
        'Could not copy the link. Select the short URL and copy it manually.',
      );
    } finally {
      copyRef.current = false;
      setCopying(false);
    }
  }

  if (deleted)
    return (
      <StatusBadge role="status" tone="success" as="p">
        Link deleted.
      </StatusBadge>
    );

  const created = new Date(link.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <DataRow>
      <div>
        <div>
          <MonoValue
            href={link.short_url}
            target="_blank"
            rel="noreferrer"
            as="a"
            className="block font-extrabold text-ink [overflow-wrap:anywhere]"
          >
            {link.short_url}
          </MonoValue>
          <p className="mt-2 mb-0 [overflow-wrap:anywhere] text-ink-muted">
            {link.url}
          </p>
        </div>
        {link.title && <TitleBadge>{link.title}</TitleBadge>}
      </div>

      <div className="col-start-1 flex flex-wrap gap-2.5 text-[0.84rem] text-ink-muted max-[840px]:col-auto max-[840px]:row-auto max-[840px]:justify-start">
        <span>{link.clicks || 0} clicks</span>
        <span>Created {created}</span>
        <span>{link.is_active ? 'Active' : 'Paused'}</span>
      </div>

      <RowActions className="col-start-2 row-span-2 row-start-1 max-[840px]:col-auto max-[840px]:row-auto">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={copyToClipboard}
          disabled={copying || Boolean(pending)}
        >
          {copying ? 'Copying' : 'Copy'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={startEdit}
          disabled={Boolean(pending) || copying || editing}
        >
          Edit
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={Boolean(pending) || copying || editing}
          onClick={() =>
            handleUpdate(
              { is_active: !link.is_active },
              'activity',
              link.is_active
                ? 'Link paused. Redirects are stopped.'
                : 'Link resumed. Redirects are working.',
            )
          }
        >
          {pending === 'activity'
            ? link.is_active
              ? 'Pausing'
              : 'Resuming'
            : link.is_active
              ? 'Pause'
              : 'Resume'}
        </Button>
        <Button
          type="button"
          variant="danger"
          size="sm"
          onClick={handleDelete}
          disabled={Boolean(pending) || copying || editing}
        >
          {pending === 'deleting' ? 'Deleting' : 'Delete'}
        </Button>
      </RowActions>
      {editing && (
        <FormStack className={`col-span-full mt-0`} onSubmit={saveChanges}>
          <FieldInput
            label="Destination URL"
            id={`${fieldId}-url`}
            type="url"
            required
            autoFocus
            value={form.url}
            disabled={Boolean(pending)}
            onChange={(event) =>
              setForm((current) => ({ ...current, url: event.target.value }))
            }
          />
          <FieldInput
            label="Title"
            id={`${fieldId}-title`}
            maxLength={256}
            value={form.title}
            disabled={Boolean(pending)}
            onChange={(event) =>
              setForm((current) => ({ ...current, title: event.target.value }))
            }
          />
          <Note >
            Your short URL stays the same.
          </Note>
          <RowActions align="start">
            <Button variant="primary" type="submit" disabled={Boolean(pending)}>
              {pending === 'saving' ? 'Saving' : 'Save changes'}
            </Button>
            <Button
              variant="secondary"
              type="button"
              disabled={Boolean(pending)}
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </RowActions>
        </FormStack>
      )}
      {error && (
        <Alert className={`col-span-full`} role="alert">
          {error}
        </Alert>
      )}
      {message && (
        <StatusBadge
          className={`col-span-full m-0 whitespace-normal`}
          tone="success"
          as="p"
          role="status"
        >
          {message}
        </StatusBadge>
      )}
    </DataRow>
  );
}
