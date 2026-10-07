import { useEffect, useState } from 'react';
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
import { alert, button, eyebrow, input, muted, serif, srOnly } from '../styles/ui';

const PAGE_SIZE = 50;

export default function Dashboard() {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [user, setUser] = useState(null);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(null);
  const [linksError, setLinksError] = useState('');
  const [domains, setDomains] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [billing, setBilling] = useState(null);

  async function refreshBilling() {
    const data = await getBillingStatus();
    setBilling(data);
  }

  useEffect(() => {
    let cancelled = false;
    async function loadInitialData() {
      const [userData, domainsData, apiKeysData] = await Promise.allSettled([
        me(),
        getDomains(),
        getApiKeys(),
      ]);
      if (cancelled) return;
      const currentUser = userData.status === 'fulfilled' ? userData.value : null;
      if (currentUser) setUser(currentUser);
      if (domainsData.status === 'fulfilled') setDomains(domainsData.value.items || []);
      if (apiKeysData.status === 'fulfilled') setApiKeys(apiKeysData.value.items || []);
      if (currentUser && !currentUser.is_admin) {
        const billingResult = await getBillingStatus().then(
          value => ({ status: 'fulfilled', value }),
          reason => ({ status: 'rejected', reason }),
        );
        if (!cancelled && billingResult.status === 'fulfilled') setBilling(billingResult.value);
      }
    }
    loadInitialData();
    return () => {
      cancelled = true;
    };
  }, []);

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
        setLinksError(err.message);
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
    setPage(0);
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
          <p className={eyebrow}>Links</p>
          <h1 className={`${serif} m-0 text-[clamp(2.6rem,8vw,5.2rem)] leading-[0.88] tracking-normal`}>Control room.</h1>
          <p className={muted}>
            {summary ? `${summary.total_links} links` : loading ? 'Loading link totals' : 'Link totals unavailable'}
            {user?.created_at ? `, joined ${new Date(user.created_at).toLocaleDateString()}` : ''}
          </p>
        </div>
        <button type="button" className={`${button.primary} max-[520px]:w-full`} onClick={() => setShowCreate(true)}>
          New link
        </button>
      </header>

      {user && !user.is_verified && <VerifyEmailNotice email={user.email} canUseFeatures={user.can_use_features} />}

      <section
        className="my-9 mb-6 grid grid-cols-3 overflow-hidden rounded-[28px] border border-[rgba(7,25,54,0.14)] bg-[rgba(255,250,241,0.32)] max-[840px]:grid-cols-1"
        aria-label="Link metrics"
      >
        <article className="grid gap-3 border-r border-[rgba(7,25,54,0.14)] p-[26px] max-[840px]:border-r-0 max-[840px]:border-b">
          <span className="text-[#38516f]">Total links</span>
          <strong className="text-[2.6rem] leading-none">{summary?.total_links ?? '—'}</strong>
        </article>
        <article className="grid gap-3 border-r border-[rgba(7,25,54,0.14)] p-[26px] max-[840px]:border-r-0 max-[840px]:border-b">
          <span className="text-[#38516f]">Clicks on current links</span>
          <strong className="text-[2.6rem] leading-none">{summary?.total_clicks ?? '—'}</strong>
        </article>
        <article className="grid gap-3 p-[26px]">
          <span className="text-[#38516f]">Active links</span>
          <strong className="text-[2.6rem] leading-none">{summary?.active_links ?? '—'}</strong>
        </article>
      </section>

      <p className={`${muted} text-sm`}>
        Clicks count every successful GET redirect across all your current links, including your own visits
        and repeat visits. Visitors are not deduplicated. Deleting a link removes its clicks from this total.
      </p>

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

      {loading ? (
        <div className="rounded-[28px] border border-[rgba(7,25,54,0.14)] bg-[rgba(255,250,241,0.4)] p-[52px] text-center max-[520px]:rounded-[22px] max-[520px]:p-[18px]">
          Loading links
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
            <LinkCard key={link.id} link={link} onDeleted={handleDeleted} />
          ))}
        </div>
      )}

      {!loading && !linksError && total > 0 && (
        <nav className="mt-[18px] flex flex-wrap items-center justify-between gap-3" aria-label="Links pagination">
          <p className={muted} aria-live="polite">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total} {filter.trim() ? 'matching links' : 'links'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button.secondary} disabled={page === 0} onClick={() => changePage(page - 1)}>Previous</button>
            <button type="button" className={button.secondary} disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => changePage(page + 1)}>Next</button>
          </div>
        </nav>
      )}

      <div className="mt-[34px] grid min-w-0 gap-[18px]">
        <DomainPanel domains={domains} onChange={setDomains} onDeleted={handleDomainDeleted} />
        <div className="grid min-w-0 items-start gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))]">
          {!user?.is_admin && <BillingPanel billing={billing} onRefresh={refreshBilling} />}
          <ApiKeyPanel apiKeys={apiKeys} onChange={setApiKeys} />
        </div>
      </div>

      <CreateLinkModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
        domains={domains}
      />
    </Layout>
  );
}
