import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  getApiKeys,
  getBillingStatus,
  getDomains,
  getLinks,
  me,
} from '../api/client';
import ApiKeyPanel from '../components/ApiKeyPanel';
import BillingPanel from '../components/BillingPanel';
import CreateLinkModal from '../components/CreateLinkModal';
import DomainPanel from '../components/DomainPanel';
import Layout from '../components/Layout';
import LinkCard from '../components/LinkCard';
import VerifyEmailNotice from '../components/VerifyEmailNotice';
import { alert, button, eyebrow, input, muted, panel, serif, srOnly } from '../styles/ui';

const PAGE_SIZE = 50;

// Each request owns its status; one failed service must not erase another's data.
function useResource(loader, enabled = true) {
  const [resource, setResource] = useState({ status: 'loading', data: null, error: '' });
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    setResource(current => ({ ...current, status: 'loading', error: '' }));
    try {
      const data = await loader();
      if (request === sequence.current) setResource({ status: 'ready', data, error: '' });
      return data;
    } catch (err) {
      if (request === sequence.current) {
        setResource({ status: 'error', data: null, error: err.message || 'Please try again.' });
      }
      throw err;
    }
  }, [loader]);
  useEffect(() => {
    let cancelled = false;
    if (enabled) Promise.resolve().then(() => {
      if (!cancelled) refresh().catch(() => {});
    });
    return () => { cancelled = true; sequence.current += 1; };
  }, [enabled, refresh]);
  function update(data) {
    setResource({ status: 'ready', data, error: '' });
  }
  return { ...resource, refresh, update };
}

function RequestState({ resource, label, children }) {
  if (resource.status === 'ready') return children;
  return (
    <div className={panel} aria-label={label} aria-busy={resource.status === 'loading'}>
      {resource.status === 'loading' ? <p className={muted} role="status">Loading {label.toLowerCase()}…</p> : (
        <div className={alert} role="alert">
          <p>Could not load {label.toLowerCase()}: {resource.error}</p>
          <button type="button" className={button.secondary} onClick={() => resource.refresh().catch(() => {})}>Retry</button>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const account = useResource(me);
  const user = account.data;
  const location = useLocation();
  const navigate = useNavigate();
  const section = ['#domains', '#billing', '#api-keys'].includes(location.hash) ? location.hash : '#links';
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(null);
  const [linksError, setLinksError] = useState('');
  const domainResource = useResource(getDomains);
  const keyResource = useResource(getApiKeys);
  const billingResource = useResource(getBillingStatus, account.status === 'ready' && !user.is_admin);
  const domains = domainResource.data?.items || [];

  useEffect(() => {
    let cancelled = false;
    // Ignore superseded requests so a slow search cannot replace a newer page.
    async function loadLinks() {
      try {
        const data = await getLinks({ search: filter, skip: page * PAGE_SIZE, limit: PAGE_SIZE });
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
    return () => { cancelled = true; };
  }, [filter, page, revision]);

  function reloadLinks() {
    setLoading(true);
    setSummary(null);
    setRevision(current => current + 1);
  }

  async function handleDomainDeleted(domainId) {
    // Remove the affected cards immediately, even if the follow-up request
    // fails, then reload so the total and aggregates come back from the server.
    setLinks(current => current.filter(link => link.domain_id !== domainId));
    reloadLinks();
  }

  function handleDeleted() {
    // Re-fetch the filtered total, aggregates and page after the server mutation.
    reloadLinks();
  }

  function handleCreated() {
    // Show the new card even when the old view was filtered or on another page.
    setFilter('');
    setPage(0);
    navigate('/dashboard');
    reloadLinks();
  }

  function changePage(nextPage) {
    setLoading(true);
    setPage(nextPage);
  }

  return (
    <Layout>
      <header className="flex items-end justify-between gap-6 max-[840px]:items-start max-[520px]:flex-col max-[520px]:gap-[18px]">
        <div>
          <p className={eyebrow}>Workspace</p>
          <h1 className={`${serif} m-0 text-[clamp(2rem,4vw,3rem)] leading-[1] tracking-normal`}>{section === '#links' ? 'Your links.' : section === '#domains' ? 'Custom domains.' : section === '#billing' ? 'Billing.' : 'API keys.'}</h1>
        </div>
        <button type="button" className={`${button.primary} max-[520px]:w-full`} onClick={() => setShowCreate(true)}>
          New link
        </button>
      </header>

      <nav className="my-5 flex flex-wrap gap-2" aria-label="Workspace sections">
        {[['#links', 'Links'], ['#domains', 'Domains'], ['#billing', 'Billing'], ['#api-keys', 'API keys']]
          .filter(([hash]) => hash !== '#billing' || !user?.is_admin)
          .map(([hash, label]) => (
            <a key={hash} href={hash} className={`${button.compactSecondary} max-[520px]:w-auto! ${section === hash ? 'bg-[#071936]! text-[#f8f1e6]!' : ''}`} aria-current={section === hash ? 'page' : undefined}>{label}</a>
          ))}
      </nav>

      <RequestState resource={account} label="Account">
        {user && !user.is_verified && <VerifyEmailNotice email={user.email} canUseFeatures={user.can_use_features} />}
      </RequestState>

      {section === '#links' && <>
        <section className="mb-[18px]" aria-label="Link actions">
          <label htmlFor="search-links" className={srOnly}>Search links</label>
          <input
            className={`${input} max-w-[520px]`}
            id="search-links"
            type="search"
            value={filter}
            onChange={event => {
              setLoading(true);
              setPage(0);
              setFilter(event.target.value);
            }}
            placeholder="Search by slug, destination, or title"
          />
        </section>

        <section className="mb-[18px] rounded-2xl border border-[rgba(7,25,54,0.14)] bg-[rgba(255,250,241,0.32)] px-4 py-3" aria-label="Link summary" aria-busy={loading}>
          <p className="m-0 flex flex-wrap gap-x-5 gap-y-1 text-sm text-[#38516f]" role="status">
            {loading ? 'Loading link totals…' : linksError || !summary ? 'Link totals unavailable.' : <>
              <span><strong>{summary.total_links}</strong> total links</span>
              <span><strong>{summary.total_clicks}</strong> clicks on current links</span>
              <span><strong>{summary.active_links}</strong> active links</span>
            </>}
          </p>
          <details className="mt-2 text-sm text-[#38516f]">
            <summary className="cursor-pointer">How clicks are counted</summary>
            <p>Clicks count every successful GET redirect across all your current links, including your own visits
              and repeat visits. Visitors are not deduplicated. Deleting a link removes its clicks from this total.</p>
          </details>
        </section>

        {loading ? (
          <div className="rounded-[28px] border border-[rgba(7,25,54,0.14)] bg-[rgba(255,250,241,0.4)] p-[52px] text-center max-[520px]:rounded-[22px] max-[520px]:p-[18px]">
            <span role="status">Loading links…</span>
          </div>
        ) : linksError ? (
          <div className={alert} role="alert">
            <p>Could not load links: {linksError}</p>
            <button type="button" className={button.secondary} onClick={reloadLinks}>Retry</button>
          </div>
        ) : links.length === 0 ? (
          <div className="rounded-[28px] border border-[rgba(7,25,54,0.14)] bg-[rgba(255,250,241,0.4)] p-[52px] text-center max-[520px]:rounded-[22px] max-[520px]:p-[18px]">
            <h2 className={`${serif} m-0 text-[clamp(2.6rem,8vw,5.2rem)] leading-[0.88] tracking-normal`}>
              {filter.trim() ? 'No matches.' : 'No links yet.'}
            </h2>
            <p className="text-[#38516f]">{filter.trim() ? 'Try another search term.' : 'Create the first short link for this workspace.'}</p>
            {!filter.trim() && (
              <button type="button" className={button.secondary} onClick={() => setShowCreate(true)}>
                Create link
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-3.5">
            {links.map(link => (
              <LinkCard key={link.id} link={link} onDeleted={handleDeleted} onUpdated={reloadLinks} />
            ))}
          </div>
        )}

        {!loading && !linksError && total > 0 && (
          <nav className="mt-[18px] flex flex-wrap items-center justify-between gap-3" aria-label="Links pagination">
            <p className={muted} aria-live="polite">
              {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} of {total} {filter.trim() ? 'matching links' : 'links'}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={button.secondary} disabled={page === 0} onClick={() => changePage(page - 1)}>Previous</button>
              <button type="button" className={button.secondary} disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => changePage(page + 1)}>Next</button>
            </div>
          </nav>
        )}

      </>}

      {/* Hash-linked views keep settings reachable regardless of the link count. */}
      <div className="grid min-w-0 gap-[18px]">
        {section === '#domains' && <RequestState resource={domainResource} label="Domains">
          <DomainPanel domains={domains} onChange={items => domainResource.update({ items })} onDeleted={handleDomainDeleted} />
        </RequestState>}
        {section === '#billing' && account.status === 'ready' && (
          user.is_admin ? <p className={muted}>Administrator accounts do not require billing.</p> :
          <RequestState resource={billingResource} label="Billing">
            <BillingPanel billing={billingResource.data} onRefresh={billingResource.refresh} />
          </RequestState>
        )}
        {section === '#api-keys' && <RequestState resource={keyResource} label="API keys">
          <ApiKeyPanel apiKeys={keyResource.data?.items || []} onChange={items => keyResource.update({ items })} />
        </RequestState>}
      </div>

      <CreateLinkModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
        domains={domains}
        domainsStatus={domainResource.status}
        domainsError={domainResource.error}
        onRetryDomains={() => domainResource.refresh().catch(() => {})}
      />
    </Layout>
  );
}
