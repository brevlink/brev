import {
  Alert,
  Button,
  Dialog,
  Eyebrow,
  Field,
  FieldError,
  FieldInput,
  FormStack,
  Input,
  Label,
  MonoValue,
  Note,
  OptionButton,
  PanelTitle,
  ResultCard,
  RowActions,
  StatusBadge,
} from './ui';
import { useEffect, useRef, useState } from 'react';
import { createLink } from '../api/client';
import { domainPublishingIssue } from '../utils/domains';

const initialForm = { url: '', slug: '', title: '', domainId: '' };

export default function CreateLinkModal({
  open,
  onClose,
  onCreated,
  domains = [],
  domainsStatus = 'ready',
  domainsError = '',
  onRetryDomains,
}) {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [domainError, setDomainError] = useState('');
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
  const selectedDomain = domains.find((domain) => domain.id === form.domainId);

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
    if (field === 'domainId') setDomainError('');
    setForm((current) => ({ ...current, [field]: value }));
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
    setDomainError('');
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
      setError(
        'Could not copy the link. Select the short URL and copy it manually.',
      );
    } finally {
      copyRef.current = false;
      setCopying(false);
    }
  }

  function openDomainMenu() {
    setActiveDomainIndex(
      Math.max(
        0,
        domains.findIndex((domain) => domain.id === form.domainId) + 1,
      ),
    );
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
        setActiveDomainIndex((current) =>
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? domains.length
              : (current +
                  (event.key === 'ArrowDown' ? 1 : -1) +
                  domains.length +
                  1) %
                (domains.length + 1),
        );
      }
    } else if (event.key === 'Enter' && domainMenuOpen) {
      event.preventDefault();
      if (activeDomainIndex === 0 || domains[activeDomainIndex - 1]) {
        selectDomain(
          activeDomainIndex === 0 ? null : domains[activeDomainIndex - 1],
        );
      }
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (requestRef.current) return;
    requestRef.current = true;
    setError('');
    setResult(null);
    setDomainError('');
    // Readiness may change while the dialog is open; never silently publish
    // on the default domain when a previously selected domain becomes unusable.
    if (
      form.domainId &&
      (!selectedDomain || domainPublishingIssue(selectedDomain))
    ) {
      setDomainError(
        selectedDomain
          ? domainPublishingIssue(selectedDomain)
          : 'Domain no longer available. Choose another domain.',
      );
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
    <Dialog
      ref={dialogRef}
      open={open}
      onDismiss={closeDialog}
      aria-labelledby="create-link-title"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <Eyebrow>New short link</Eyebrow>
          <PanelTitle id="create-link-title">Create link.</PanelTitle>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={closeDialog}
          aria-label="Close modal"
        >
          ×
        </Button>
      </div>

      {error && (
        <Alert className={`mt-6`} role="alert">
          {error}
        </Alert>
      )}

      {result ? (
        <ResultCard as="div">
          <strong ref={resultRef} tabIndex={-1} role="status">
            Link created
          </strong>
          <MonoValue>{result.short_url}</MonoValue>
          {result.title && (
            <span className="text-ink-muted [overflow-wrap:anywhere]">
              {result.title}
            </span>
          )}
          <span className="text-ink-muted [overflow-wrap:anywhere]">
            {result.url}
          </span>
          <Note>
            Your dashboard search has been cleared so the new link is visible.
          </Note>
          {copied && (
            <StatusBadge className={`m-0`} tone="success" as="p" role="status">
              Link copied.
            </StatusBadge>
          )}
          <RowActions align="start" className="mt-3">
            <Button
              type="button"
              variant="primary"
              onClick={copyResult}
              disabled={copying}
            >
              {copying ? 'Copying' : 'Copy'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={finish}
              disabled={copying}
            >
              Done
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={resetForm}
              disabled={copying}
            >
              Create another
            </Button>
          </RowActions>
        </ResultCard>
      ) : (
        <FormStack onSubmit={handleSubmit}>
          <FieldInput
            label="Destination URL"
            disabled={loading}
            autoFocus
            id="destination-url"
            type="url"
            value={form.url}
            onChange={(event) => updateField('url', event.target.value)}
            placeholder="https://example.com/long/path"
            required
          />

          <FieldInput
            label="Title"
            disabled={loading}
            id="link-title"
            type="text"
            value={form.title}
            onChange={(event) => updateField('title', event.target.value)}
            placeholder="Launch notes"
            maxLength={256}
          />

          <FieldInput
            label="Custom slug"
            disabled={loading}
            minLength={3}
            id="custom-slug"
            type="text"
            value={form.slug}
            onChange={(event) =>
              updateField(
                'slug',
                event.target.value.replace(/[^a-zA-Z0-9_-]/g, ''),
              )
            }
            placeholder="launch"
            maxLength={64}
          />

          <Field>
            <Label id="link-domain-label">Domain</Label>
            {domainsStatus === 'loading' && (
              <Note role="status">
                Loading custom domains… You can use brevl.ink.
              </Note>
            )}
            {domainsStatus === 'error' && (
              <Alert role="alert">
                <p>
                  Could not load custom domains: {domainsError}. You can use
                  brevl.ink.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={onRetryDomains}
                >
                  Retry domains
                </Button>
              </Alert>
            )}
            <div
              className="relative"
              onKeyDown={handleDomainKey}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setDomainMenuOpen(false);
                }
              }}
            >
              <Input
                type="button"
                id="link-domain"
                ref={domainTriggerRef}
                disabled={loading}
                className={`flex items-center justify-between gap-3 text-left`}
                as="button"
                aria-labelledby="link-domain-label link-domain"
                aria-invalid={domainError ? true : undefined}
                aria-describedby={domainError ? 'link-domain-error' : undefined}
                aria-haspopup="listbox"
                aria-controls={
                  domainMenuOpen ? 'link-domain-options' : undefined
                }
                aria-expanded={domainMenuOpen}
                onClick={() =>
                  domainMenuOpen ? setDomainMenuOpen(false) : openDomainMenu()
                }
              >
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                  {selectedDomain?.domain || 'brevl.ink'}
                </span>
                <span
                  className="shrink-0 text-sm text-ink-muted"
                  aria-hidden="true"
                >
                  ⌄
                </span>
              </Input>

              {domainMenuOpen && (
                <div
                  className="absolute z-30 mt-2 max-h-52 w-full overflow-auto rounded-2xl border border-ink/14 bg-surface-solid p-1.5 shadow-popover"
                  id="link-domain-options"
                  role="listbox"
                  aria-labelledby="link-domain-label"
                >
                  <OptionButton
                    selected={!form.domainId}
                    role="option"
                    aria-selected={!form.domainId}
                    ref={(element) => {
                      domainOptionsRef.current[0] = element;
                    }}
                    tabIndex={activeDomainIndex === 0 ? 0 : -1}
                    onFocus={() => setActiveDomainIndex(0)}
                    onClick={() => selectDomain(null)}
                  >
                    brevl.ink
                  </OptionButton>
                  {domains.map((domain, index) => (
                    <OptionButton
                      key={domain.id}
                      selected={form.domainId === domain.id}
                      className="mt-1"
                      role="option"
                      aria-selected={form.domainId === domain.id}
                      ref={(element) => {
                        domainOptionsRef.current[index + 1] = element;
                      }}
                      tabIndex={activeDomainIndex === index + 1 ? 0 : -1}
                      onFocus={() => setActiveDomainIndex(index + 1)}
                      aria-disabled={Boolean(domainPublishingIssue(domain))}
                      onClick={() => selectDomain(domain)}
                    >
                      <span className="min-w-0">
                        <span className="block overflow-hidden text-ellipsis whitespace-nowrap">
                          {domain.domain}
                        </span>
                        {domainPublishingIssue(domain) && (
                          <span className="block text-[0.78rem] font-normal text-ink-muted">
                            {domainPublishingIssue(domain)}{' '}
                            {domain.role === 'member'
                              ? 'Ask the owner to check status.'
                              : 'Check status in Custom domains.'}
                          </span>
                        )}
                      </span>
                    </OptionButton>
                  ))}
                </div>
              )}
            </div>
            {domainError && (
              <FieldError id="link-domain-error">{domainError}</FieldError>
            )}
          </Field>

          <Button
            type="submit"
            className="w-full"
            variant="primary"
            disabled={loading}
          >
            {loading ? 'Creating' : 'Create link'}
          </Button>
        </FormStack>
      )}
    </Dialog>
  );
}
