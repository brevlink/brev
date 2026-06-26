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
} from '../styles/ui';

const initialForm = { url: '', slug: '', title: '', domainId: '' };

export default function CreateLinkModal({ open, onClose, onCreated, domains = [] }) {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [domainMenuOpen, setDomainMenuOpen] = useState(false);
  const dialogRef = useRef(null);
  const verifiedDomains = domains.filter(domain => domain.is_verified);
  const selectedDomain = verifiedDomains.find(domain => domain.id === form.domainId);

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

  function selectDomain(domainId) {
    updateField('domainId', domainId);
    setDomainMenuOpen(false);
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
        setDomainMenuOpen(false);
        onClose();
      }, 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-48px)] w-[min(calc(100%-32px),560px)] overflow-visible rounded-[30px] border border-[rgba(7,25,54,0.14)] bg-[#f8f1e6] p-7 text-[#071936] shadow-[0_28px_90px_rgba(7,25,54,0.28)] backdrop:bg-[rgba(7,25,54,0.32)] backdrop:backdrop-blur-[10px] max-[520px]:max-h-[calc(100dvh-20px)] max-[520px]:w-[calc(100%-20px)] max-[520px]:p-[18px]"
      aria-labelledby="create-link-title"
      onCancel={onClose}
    >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={eyebrow}>New short link</p>
            <h2 id="create-link-title" className={panelTitle}>Create link.</h2>
          </div>
          <button type="button" className={iconButton} onClick={onClose} aria-label="Close modal">
            ×
          </button>
        </div>

        {result ? (
          <div className="mt-6 grid gap-2 rounded-[20px] border border-[rgba(7,25,54,0.14)] bg-[rgba(217,197,165,0.2)] p-[18px]">
            <strong>Link created</strong>
            <span className="font-['JetBrains_Mono',ui-monospace,monospace] text-[#38516f] [overflow-wrap:anywhere]">
              {result.short_url}
            </span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={formStack}>
            {error && <div className={alert}>{error}</div>}

            <div className={field}>
              <label className={fieldLabel} htmlFor="destination-url">Destination URL</label>
              <input
                className={input}
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
                id="custom-slug"
                type="text"
                value={form.slug}
                onChange={event => updateField('slug', event.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                placeholder="launch"
                maxLength={64}
              />
            </div>

            <div className={field}>
              <label className={fieldLabel} id="link-domain-label">Domain</label>
              <div
                className="relative"
                onBlur={event => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    setDomainMenuOpen(false);
                  }
                }}
              >
                <button
                  type="button"
                  id="link-domain"
                  className={`${input} flex items-center justify-between gap-3 text-left`}
                  aria-labelledby="link-domain-label link-domain"
                  aria-haspopup="listbox"
                  aria-expanded={domainMenuOpen}
                  onClick={() => setDomainMenuOpen(current => !current)}
                >
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                    {selectedDomain?.domain || 'brevl.ink'}
                  </span>
                  <span className="shrink-0 text-sm text-[#38516f]" aria-hidden="true">⌄</span>
                </button>

                {domainMenuOpen && (
                  <div
                    className="absolute z-30 mt-2 max-h-52 w-full overflow-auto rounded-2xl border border-[rgba(7,25,54,0.14)] bg-[#fffaf1] p-1.5 shadow-[0_18px_46px_rgba(7,25,54,0.18)]"
                    role="listbox"
                    aria-labelledby="link-domain-label"
                  >
                    <button
                      type="button"
                      className={`flex min-h-10 w-full items-center rounded-xl px-3 text-left font-semibold text-[#071936] hover:bg-[rgba(217,197,165,0.35)] ${
                        !form.domainId ? 'bg-[#071936] text-[#f8f1e6] hover:bg-[#071936]' : ''
                      }`}
                      role="option"
                      aria-selected={!form.domainId}
                      onClick={() => selectDomain('')}
                    >
                      brevl.ink
                    </button>
                    {verifiedDomains.map(domain => (
                      <button
                        key={domain.id}
                        type="button"
                        className={`mt-1 flex min-h-10 w-full items-center rounded-xl px-3 text-left font-semibold text-[#071936] hover:bg-[rgba(217,197,165,0.35)] ${
                          form.domainId === domain.id ? 'bg-[#071936] text-[#f8f1e6] hover:bg-[#071936]' : ''
                        }`}
                        role="option"
                        aria-selected={form.domainId === domain.id}
                        onClick={() => selectDomain(domain.id)}
                      >
                        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{domain.domain}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <button type="submit" className={button.fullPrimary} disabled={loading}>
              {loading ? 'Creating' : 'Create link'}
            </button>
          </form>
        )}
    </dialog>
  );
}
