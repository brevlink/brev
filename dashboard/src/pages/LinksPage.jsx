import { useEffect, useState } from 'react';
import { getDomains, getLinks } from '../api/client';
import useResource from '../hooks/useResource';
import CreateLinkModal from '../components/CreateLinkModal';
import LinkCard from '../components/LinkCard';
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Input,
  Label,
  Muted,
  PageHeader,
  Panel,
} from '../components/ui';

const PAGE_SIZE = 50;

export default function LinksPage() {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(null);
  const [linksError, setLinksError] = useState('');
  const domainResource = useResource(getDomains);
  const domains = domainResource.data?.items || [];

  useEffect(() => {
    let cancelled = false;
    // Ignore superseded requests so a slow search cannot replace a newer page.
    async function loadLinks() {
      try {
        const data = await getLinks({
          search: filter,
          skip: page * PAGE_SIZE,
          limit: PAGE_SIZE,
        });
        if (cancelled) return;
        // Deletion (or another session) can leave the last page out of range.
        const lastPage = Math.max(0, Math.ceil(data.total / PAGE_SIZE) - 1);
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setLinks(data.items);
        setTotal(data.total);
        setSummary(data.summary);
        setLinksError('');
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        // Failed loads are not empty accounts, and unknown metrics are not zero.
        setLinksError(err.message || 'Please try again.');
        setSummary(null);
        setLoading(false);
      }
    }
    loadLinks();
    return () => {
      cancelled = true;
    };
  }, [filter, page, revision]);

  function reloadLinks() {
    setLoading(true);
    setSummary(null);
    setRevision((current) => current + 1);
  }

  function handleDeleted() {
    // Re-fetch the filtered total, aggregates and page after the server mutation.
    reloadLinks();
  }

  function handleCreated() {
    // Show the new card even when the old view was filtered or on another page.
    setFilter('');
    setPage(0);
    reloadLinks();
  }

  function changePage(nextPage) {
    setLoading(true);
    setPage(nextPage);
  }

  return (
    <>
      <PageHeader
        title="Your links."
        description="Create and manage links for your workspace."
        action={
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            New link
          </Button>
        }
      />
      <Field as="section" className="mb-5" aria-label="Link actions">
        <Label htmlFor="search-links">Search links</Label>
        <Input
          id="search-links"
          type="search"
          value={filter}
          onChange={(event) => {
            setLoading(true);
            setPage(0);
            setFilter(event.target.value);
          }}
          placeholder="Search by slug, destination, or title"
        />
      </Field>

      <Panel
        className="mb-5 gap-2 px-4 py-3"
        aria-label="Link summary"
        aria-busy={loading}
      >
        <p
          className="m-0 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-muted"
          role="status"
        >
          {loading ? (
            'Loading link totals…'
          ) : linksError || !summary ? (
            'Link totals unavailable.'
          ) : (
            <>
              <span>
                <strong>{summary.total_links}</strong> total links
              </span>
              <span>
                <strong>{summary.total_clicks}</strong> clicks on current links
              </span>
              <span>
                <strong>{summary.active_links}</strong> active links
              </span>
            </>
          )}
        </p>
        <details className="mt-2 text-sm text-ink-muted">
          <summary className="cursor-pointer">How clicks are counted</summary>
          <p>
            Clicks count every successful GET redirect across all your current
            links, including your own visits and repeat visits, excluding known bots and
            prefetch requests. Statistics show daily distinct visitors. Deleting a link removes its clicks from this total.
          </p>
        </details>
      </Panel>

      {loading ? (
        <Panel className="py-12 text-center">
          <span role="status">Loading links…</span>
        </Panel>
      ) : linksError ? (
        <Alert role="alert">
          <p>Could not load links: {linksError}</p>
          <Button type="button" variant="secondary" onClick={reloadLinks}>
            Retry
          </Button>
        </Alert>
      ) : links.length === 0 ? (
        <EmptyState
          title={filter.trim() ? 'No matches.' : 'No links yet.'}
          action={
            filter.trim() ? (
              <Button
                onClick={() => {
                  setFilter('');
                  setPage(0);
                  reloadLinks();
                }}
              >
                Clear search
              </Button>
            ) : (
              <Button onClick={() => setShowCreate(true)}>Create link</Button>
            )
          }
        >
          {filter.trim()
            ? 'Try another search term, or clear your search.'
            : 'Create the first short link for this workspace.'}
        </EmptyState>
      ) : (
        <div className="grid gap-3.5">
          {links.map((link) => (
            <LinkCard
              key={link.id}
              link={link}
              onDeleted={handleDeleted}
              onUpdated={reloadLinks}
            />
          ))}
        </div>
      )}

      {!loading && !linksError && total > 0 && (
        <nav
          className="mt-[18px] flex flex-wrap items-center justify-between gap-3"
          aria-label="Links pagination"
        >
          <Muted aria-live="polite">
            {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} of{' '}
            {total} {filter.trim() ? 'matching links' : 'links'}
          </Muted>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={page === 0}
              onClick={() => changePage(page - 1)}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={(page + 1) * PAGE_SIZE >= total}
              onClick={() => changePage(page + 1)}
            >
              Next
            </Button>
          </div>
        </nav>
      )}

      <CreateLinkModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
        domains={domains}
        domainsStatus={domainResource.status}
        domainsError={domainResource.error}
        onRetryDomains={() => domainResource.refresh().catch(() => {})}
      />
    </>
  );
}
