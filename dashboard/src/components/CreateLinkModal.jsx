import { useEffect, useRef, useState } from 'react';
import { createLink } from '../api/client';

const initialForm = { url: '', slug: '', title: '', domainId: '' };

export default function CreateLinkModal({ open, onClose, onCreated, domains = [] }) {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    }
    if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  if (!open) return null;

  function updateField(field, value) {
    setForm(current => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);

    try {
      const data = await createLink({
        url: form.url,
        slug: form.slug || null,
        title: form.title || null,
        domainId: form.domainId || null,
      });
      setResult(data);
      onCreated?.(data);
      window.setTimeout(() => {
        setForm(initialForm);
        setResult(null);
        onClose();
      }, 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <dialog ref={dialogRef} className="modal" aria-labelledby="create-link-title" onCancel={onClose}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">New short link</p>
            <h2 id="create-link-title" className="serif">Create link.</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close modal">
            ×
          </button>
        </div>

        {result ? (
          <div className="success-box">
            <strong>Link created</strong>
            <span>{result.short_url}</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="form-stack">
            {error && <div className="alert">{error}</div>}

            <div className="field">
              <label htmlFor="destination-url">Destination URL</label>
              <input
                id="destination-url"
                type="url"
                value={form.url}
                onChange={event => updateField('url', event.target.value)}
                placeholder="https://example.com/long/path"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="link-title">Title</label>
              <input
                id="link-title"
                type="text"
                value={form.title}
                onChange={event => updateField('title', event.target.value)}
                placeholder="Launch notes"
                maxLength={256}
              />
            </div>

            <div className="field">
              <label htmlFor="custom-slug">Custom slug</label>
              <input
                id="custom-slug"
                type="text"
                value={form.slug}
                onChange={event => updateField('slug', event.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                placeholder="launch"
                maxLength={64}
              />
            </div>

            <div className="field">
              <label htmlFor="link-domain">Domain</label>
              <select
                id="link-domain"
                value={form.domainId}
                onChange={event => updateField('domainId', event.target.value)}
              >
                <option value="">brevl.ink</option>
                {domains
                  .filter(domain => domain.is_verified)
                  .map(domain => (
                    <option key={domain.id} value={domain.id}>
                      {domain.domain}
                    </option>
                  ))}
              </select>
            </div>

            <button type="submit" className="button primary full" disabled={loading}>
              {loading ? 'Creating' : 'Create link'}
            </button>
          </form>
        )}
    </dialog>
  );
}
