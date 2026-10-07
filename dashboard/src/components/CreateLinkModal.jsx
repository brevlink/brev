import { useEffect, useRef, useState } from 'react';
import { createLink } from '../api/client';
import {
  alert,
  button,
  eyebrow,
  field,
  fieldLabel,
  formStack,
  iconButton,
  input,
  panelTitle,
  status,
} from '../styles/ui';

const initialForm = { url: '', slug: '', title: '', domainId: '' };

export default function CreateLinkModal({ open, onClose, onCreated, domains = [] }) {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const requestRef = useRef(false);
  const copyRef = useRef(false);
  const resultRef = useRef(null);
  const dialogRef = useRef(null);
  const verifiedDomains = domains.filter(domain => domain.is_verified);

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

  useEffect(() => {
    if (open && result) resultRef.current?.focus();
  }, [open, result]);

  if (!open) return null;

  function updateField(field, value) {
    setForm(current => ({ ...current, [field]: value }));
  }

  function closeDialog() {
    // Close natively before unmounting so keyboard focus returns to the opener.
    dialogRef.current?.close();
    onClose();
  }

  function resetForm() {
    setForm(initialForm);
    setResult(null);
    setError('');
    setCopied(false);
  }

  function finish() {
    resetForm();
    closeDialog();
  }

  async function copyResult() {
    if (copyRef.current) return;
    copyRef.current = true;
    setCopying(true);
    setCopied(false);
    setError('');
    try {
      await navigator.clipboard.writeText(result.short_url);
      setCopied(true);
    } catch {
      setError('Could not copy the link. Select the short URL and copy it manually.');
    } finally {
      copyRef.current = false;
      setCopying(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (requestRef.current) return;
    requestRef.current = true;
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
      // The result stays available even if the dialog was closed during the request.
      // No delayed close can accidentally dismiss a later opening.
    } catch (err) {
      setError(err.message || 'Could not create the link. Please try again.');
    } finally {
      requestRef.current = false;
      setLoading(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-48px)] w-[min(calc(100%-32px),560px)] overflow-y-auto overscroll-contain rounded-[30px] border border-[rgba(7,25,54,0.14)] bg-[#f8f1e6] p-7 text-[#071936] shadow-[0_28px_90px_rgba(7,25,54,0.28)] backdrop:bg-[rgba(7,25,54,0.32)] backdrop:backdrop-blur-[10px] max-[520px]:max-h-[calc(100dvh-20px)] max-[520px]:w-[calc(100%-20px)] max-[520px]:p-[18px]"
      aria-labelledby="create-link-title"
      onCancel={event => { event.preventDefault(); closeDialog(); }}
    >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={eyebrow}>New short link</p>
            <h2 id="create-link-title" className={panelTitle}>Create link.</h2>
          </div>
          <button type="button" className={iconButton} onClick={closeDialog} aria-label="Close modal">
            ×
          </button>
        </div>

        {error && <div className={`${alert} mt-6`} role="alert">{error}</div>}

        {result ? (
          <div className="mt-6 grid gap-2 rounded-[20px] border border-[rgba(7,25,54,0.14)] bg-[rgba(217,197,165,0.2)] p-[18px]">
            <strong ref={resultRef} tabIndex={-1} role="status">Link created</strong>
            <span className="font-['JetBrains_Mono',ui-monospace,monospace] text-[#38516f] [overflow-wrap:anywhere]">
              {result.short_url}
            </span>
            {result.title && <span className="text-[#38516f] [overflow-wrap:anywhere]">{result.title}</span>}
            <span className="text-[#38516f] [overflow-wrap:anywhere]">{result.url}</span>
            <p className="m-0 text-sm text-[#38516f]">To find this link in the dashboard, search for {result.slug} or clear your search.</p>
            {copied && <p className={`${status.good} m-0`} role="status">Link copied.</p>}
            <div className="mt-3 flex flex-wrap gap-2.5">
              <button type="button" className={button.primary} onClick={copyResult} disabled={copying}>{copying ? 'Copying' : 'Copy'}</button>
              <button type="button" className={button.secondary} onClick={finish} disabled={copying}>Done</button>
              <button type="button" className={button.secondary} onClick={resetForm} disabled={copying}>Create another</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={formStack}>
            <div className={field}>
              <label className={fieldLabel} htmlFor="destination-url">Destination URL</label>
              <input
                className={input}
                disabled={loading}
                autoFocus
                id="destination-url"
                type="url"
                value={form.url}
                onChange={event => updateField('url', event.target.value)}
                placeholder="https://example.com/long/path"
                required
              />
            </div>

            <div className={field}>
              <label className={fieldLabel} htmlFor="link-title">Title</label>
              <input
                className={input}
                disabled={loading}
                id="link-title"
                type="text"
                value={form.title}
                onChange={event => updateField('title', event.target.value)}
                placeholder="Launch notes"
                maxLength={256}
              />
            </div>

            <div className={field}>
              <label className={fieldLabel} htmlFor="custom-slug">Custom slug</label>
              <input
                className={input}
                disabled={loading}
                minLength={3}
                id="custom-slug"
                type="text"
                value={form.slug}
                onChange={event => updateField('slug', event.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                placeholder="launch"
                maxLength={64}
              />
            </div>

            <div className={field}>
              <label className={fieldLabel} htmlFor="link-domain">Domain</label>
              {/* A native select supports keyboard navigation without an overlay escaping the scroll area. */}
              <select id="link-domain" className={input} value={form.domainId} disabled={loading} onChange={event => updateField('domainId', event.target.value)}>
                <option value="">brevl.ink</option>
                {verifiedDomains.map(domain => <option key={domain.id} value={domain.id}>{domain.domain}</option>)}
              </select>
            </div>

            <button type="submit" className={button.fullPrimary} disabled={loading}>
              {loading ? 'Creating' : 'Create link'}
            </button>
          </form>
        )}
    </dialog>
  );
}
