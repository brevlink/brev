import { useEffect, useRef, useState } from 'react';
import { createLink } from '../api/client';
import { domainPublishingIssue } from '../utils/domains';
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

export default function CreateLinkModal({ open, onClose, onCreated, domains = [], domainsStatus = 'ready', domainsError = '', onRetryDomains }) {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  // The domain picker explains why a domain cannot serve yet, which a native
  // select cannot do, so it stays a custom listbox and needs its own open state.
  const [domainMenuOpen, setDomainMenuOpen] = useState(false);
  const [activeDomainIndex, setActiveDomainIndex] = useState(0);
  const domainTriggerRef = useRef(null);
  const domainOptionsRef = useRef([]);
  const requestRef = useRef(false);
  const copyRef = useRef(false);
  const resultRef = useRef(null);
  const dialogRef = useRef(null);
  const selectedDomain = domains.find(domain => domain.id === form.domainId);

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

  useEffect(() => {
    if (open && domainMenuOpen) {
      const option = domainOptionsRef.current[activeDomainIndex];
      option?.focus();
      option?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [open, domainMenuOpen, activeDomainIndex]);

  if (!open) return null;

  function updateField(field, value) {
    setForm(current => ({ ...current, [field]: value }));
  }

  function closeDialog() {
    // Close natively before unmounting so keyboard focus returns to the opener.
    setDomainMenuOpen(false);
    dialogRef.current?.close();
    onClose();
  }

  function resetForm() {
    setDomainMenuOpen(false);
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

  function openDomainMenu() {
    setActiveDomainIndex(Math.max(0, domains.findIndex(domain => domain.id === form.domainId) + 1));
    setDomainMenuOpen(true);
  }

  function selectDomain(domain) {
    // Keep unavailable options focusable so their readiness explanation is audible.
    if (domain && domainPublishingIssue(domain)) return;
    updateField('domainId', domain?.id || '');
    setDomainMenuOpen(false);
    domainTriggerRef.current?.focus();
  }

  function handleDomainKey(event) {
    if (event.key === 'Escape' && domainMenuOpen) {
      event.preventDefault();
      event.stopPropagation();
      setDomainMenuOpen(false);
      domainTriggerRef.current?.focus();
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!domainMenuOpen) {
        openDomainMenu();
      } else {
        setActiveDomainIndex(current => event.key === 'Home' ? 0 : event.key === 'End' ? domains.length :
          (current + (event.key === 'ArrowDown' ? 1 : -1) + domains.length + 1) % (domains.length + 1));
      }
    } else if (event.key === 'Enter' && domainMenuOpen) {
      event.preventDefault();
      if (activeDomainIndex === 0 || domains[activeDomainIndex - 1]) {
        selectDomain(activeDomainIndex === 0 ? null : domains[activeDomainIndex - 1]);
      }
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (requestRef.current) return;
    requestRef.current = true;
    setError('');
    setResult(null);
    // Readiness may change while the dialog is open; never silently publish
    // on the default domain when a previously selected domain becomes unusable.
    if (form.domainId && (!selectedDomain || domainPublishingIssue(selectedDomain))) {
      setError(selectedDomain ? domainPublishingIssue(selectedDomain) : 'Domain no longer available. Choose another domain.');
      requestRef.current = false;
      return;
    }
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
            <p className="m-0 text-sm text-[#38516f]">Your dashboard search has been cleared so the new link is visible.</p>
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
              <label className={fieldLabel} id="link-domain-label">Domain</label>
              {domainsStatus === 'loading' && <p className="m-0 text-sm text-[#38516f]" role="status">Loading custom domains… You can use brevl.ink.</p>}
              {domainsStatus === 'error' && <div className={alert} role="alert">
                <p>Could not load custom domains: {domainsError}. You can use brevl.ink.</p>
                <button type="button" className={button.compactSecondary} onClick={onRetryDomains}>Retry domains</button>
              </div>}
              <div
                className="relative"
                onKeyDown={handleDomainKey}
                onBlur={event => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    setDomainMenuOpen(false);
                  }
                }}
              >
                <button
                  type="button"
                  id="link-domain"
                  ref={domainTriggerRef}
                  disabled={loading}
                  className={`${input} flex items-center justify-between gap-3 text-left`}
                  aria-labelledby="link-domain-label link-domain"
                  aria-haspopup="listbox"
                  aria-controls={domainMenuOpen ? 'link-domain-options' : undefined}
                  aria-expanded={domainMenuOpen}
                  onClick={() => domainMenuOpen ? setDomainMenuOpen(false) : openDomainMenu()}
                >
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                    {selectedDomain?.domain || 'brevl.ink'}
                  </span>
                  <span className="shrink-0 text-sm text-[#38516f]" aria-hidden="true">⌄</span>
                </button>

                {domainMenuOpen && (
                  <div
                    className="absolute z-30 mt-2 max-h-52 w-full overflow-auto rounded-2xl border border-[rgba(7,25,54,0.14)] bg-[#fffaf1] p-1.5 shadow-[0_18px_46px_rgba(7,25,54,0.18)]"
                    id="link-domain-options"
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
                      ref={element => { domainOptionsRef.current[0] = element; }}
                      tabIndex={activeDomainIndex === 0 ? 0 : -1}
                      onFocus={() => setActiveDomainIndex(0)}
                      onClick={() => selectDomain(null)}
                    >
                      brevl.ink
                    </button>
                    {domains.map((domain, index) => (
                      <button
                        key={domain.id}
                        type="button"
                        className={`mt-1 flex min-h-10 w-full items-center rounded-xl px-3 text-left font-semibold text-[#071936] hover:bg-[rgba(217,197,165,0.35)] ${
                          form.domainId === domain.id ? 'bg-[#071936] text-[#f8f1e6] hover:bg-[#071936]' : ''
                        }`}
                        role="option"
                        aria-selected={form.domainId === domain.id}
                        ref={element => { domainOptionsRef.current[index + 1] = element; }}
                        tabIndex={activeDomainIndex === index + 1 ? 0 : -1}
                        onFocus={() => setActiveDomainIndex(index + 1)}
                        aria-disabled={Boolean(domainPublishingIssue(domain))}
                        onClick={() => selectDomain(domain)}
                      >
                        <span className="min-w-0">
                          <span className="block overflow-hidden text-ellipsis whitespace-nowrap">{domain.domain}</span>
                          {domainPublishingIssue(domain) && (
                            <span className="block text-[0.78rem] font-normal text-[#38516f]">
                              {domainPublishingIssue(domain)} {domain.role === 'member' ? 'Ask the owner to check status.' : 'Check status in Custom domains.'}
                            </span>
                          )}
                        </span>
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
