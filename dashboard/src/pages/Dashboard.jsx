import { useEffect, useMemo, useState } from 'react';
import {
  getAdminLinks,
  getAdminUsers,
  getApiKeys,
  getBillingStatus,
  getDomains,
  getLinks,
  me,
} from '../api/client';
import AdminPanel from '../components/AdminPanel';
import ApiKeyPanel from '../components/ApiKeyPanel';
import BillingPanel from '../components/BillingPanel';
import CreateLinkModal from '../components/CreateLinkModal';
import DomainPanel from '../components/DomainPanel';
import Layout from '../components/Layout';
import LinkCard from '../components/LinkCard';
import { button, eyebrow, input, muted, serif, srOnly } from '../styles/ui';

export default function Dashboard() {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [user, setUser] = useState(null);
  const [filter, setFilter] = useState('');
  const [domains, setDomains] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [billing, setBilling] = useState(null);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminLinks, setAdminLinks] = useState([]);

  async function refreshBilling() {
    const data = await getBillingStatus();
    setBilling(data);
  }

  useEffect(() => {
    let cancelled = false;
    async function loadInitialData() {
      const [userData, linksData, domainsData, apiKeysData, billingData] = await Promise.allSettled([
        me(),
        getLinks(),
        getDomains(),
        getApiKeys(),
        getBillingStatus(),
      ]);
      if (cancelled) return;
      if (userData.status === 'fulfilled') setUser(userData.value);
      if (linksData.status === 'fulfilled') setLinks(linksData.value.items || []);
      if (domainsData.status === 'fulfilled') setDomains(domainsData.value.items || []);
      if (apiKeysData.status === 'fulfilled') setApiKeys(apiKeysData.value.items || []);
      if (billingData.status === 'fulfilled') setBilling(billingData.value);
      if (userData.status === 'fulfilled' && userData.value.is_admin) {
        const [usersResult, linksResult] = await Promise.allSettled([getAdminUsers(), getAdminLinks()]);
        if (cancelled) return;
        if (usersResult.status === 'fulfilled') setAdminUsers(usersResult.value.items || []);
        if (linksResult.status === 'fulfilled') setAdminLinks(linksResult.value || []);
      }
      setLoading(false);
    }
    loadInitialData();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return links;
    return links.filter(link =>
      [link.short_url, link.url, link.slug, link.title]
        .filter(Boolean)
        .some(value => value.toLowerCase().includes(query)),
    );
  }, [filter, links]);

  const totalClicks = links.reduce((sum, link) => sum + (link.clicks || 0), 0);

  function handleDeleted(id) {
    setLinks(current => current.filter(link => link.id !== id));
  }

  function handleCreated(link) {
    setLinks(current => [link, ...current]);
  }

  return (
    <Layout>
      <header className="flex items-end justify-between gap-6 max-[840px]:items-start max-[520px]:flex-col max-[520px]:gap-[18px]">
        <div>
          <p className={eyebrow}>Links</p>
          <h1 className={`${serif} m-0 text-[clamp(2.6rem,8vw,5.2rem)] leading-[0.88] tracking-normal`}>Control room.</h1>
          <p className={muted}>
            {links.length} links, {totalClicks} tracked clicks
            {user?.created_at ? `, joined ${new Date(user.created_at).toLocaleDateString()}` : ''}
          </p>
        </div>
        <button type="button" className={`${button.primary} max-[520px]:w-full`} onClick={() => setShowCreate(true)}>
          New link
        </button>
      </header>

      <section
        className="my-9 mb-6 grid grid-cols-3 overflow-hidden rounded-[28px] border border-[rgba(7,25,54,0.14)] bg-[rgba(255,250,241,0.32)] max-[840px]:grid-cols-1"
        aria-label="Link metrics"
      >
        <article className="grid gap-3 border-r border-[rgba(7,25,54,0.14)] p-[26px] max-[840px]:border-r-0 max-[840px]:border-b">
          <span className="text-[#38516f]">Total links</span>
          <strong className="text-[2.6rem] leading-none">{links.length}</strong>
        </article>
        <article className="grid gap-3 border-r border-[rgba(7,25,54,0.14)] p-[26px] max-[840px]:border-r-0 max-[840px]:border-b">
          <span className="text-[#38516f]">Total clicks</span>
          <strong className="text-[2.6rem] leading-none">{totalClicks}</strong>
        </article>
        <article className="grid gap-3 p-[26px]">
          <span className="text-[#38516f]">Active links</span>
          <strong className="text-[2.6rem] leading-none">{links.filter(link => link.is_active).length}</strong>
        </article>
      </section>

      <section className="mb-[18px]" aria-label="Link actions">
        <label htmlFor="search-links" className={srOnly}>Search links</label>
        <input
          className={`${input} max-w-[520px]`}
          id="search-links"
          type="search"
          value={filter}
          onChange={event => setFilter(event.target.value)}
          placeholder="Search by slug, destination, or title"
        />
      </section>

      {loading ? (
        <div className="rounded-[28px] border border-[rgba(7,25,54,0.14)] bg-[rgba(255,250,241,0.4)] p-[52px] text-center max-[520px]:rounded-[22px] max-[520px]:p-[18px]">
          Loading links
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[28px] border border-[rgba(7,25,54,0.14)] bg-[rgba(255,250,241,0.4)] p-[52px] text-center max-[520px]:rounded-[22px] max-[520px]:p-[18px]">
          <h2 className={`${serif} m-0 text-[clamp(2.6rem,8vw,5.2rem)] leading-[0.88] tracking-normal`}>
            {filter ? 'No matches.' : 'No links yet.'}
          </h2>
          <p className="text-[#38516f]">{filter ? 'Try another search term.' : 'Create the first short link for this workspace.'}</p>
          {!filter && (
            <button type="button" className={button.secondary} onClick={() => setShowCreate(true)}>
              Create link
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3.5">
          {filtered.map(link => (
            <LinkCard key={link.id} link={link} onDeleted={handleDeleted} />
          ))}
        </div>
      )}

      <div className="mt-[34px] grid items-start gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))] max-[840px]:grid-cols-1">
        <BillingPanel billing={billing} onRefresh={refreshBilling} />
        <DomainPanel domains={domains} onChange={setDomains} />
        <ApiKeyPanel apiKeys={apiKeys} onChange={setApiKeys} />
      </div>

      {user?.is_admin && (
        <AdminPanel
          users={adminUsers}
          links={adminLinks}
          onUsersChange={setAdminUsers}
          onLinksChange={setAdminLinks}
        />
      )}

      <CreateLinkModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
        domains={domains}
      />
    </Layout>
  );
}
