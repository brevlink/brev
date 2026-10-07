import { useEffect, useState } from 'react';
import { getAdminLinks, getAdminReports, getAdminUsers } from '../api/client';
import AdminPanel, { adminRequest } from '../components/AdminPanel';
import Layout from '../components/Layout';
import { alert, button, dataRow, dataText, dataTitle, eyebrow, field, fieldLabel, input, muted, panel, panelTitle, rowActions, serif } from '../styles/ui';

const PAGE_SIZE = 20;

function Pagination({ total, page, onChange, label }) {
  return (
    <div className="my-4 flex flex-wrap items-center gap-3" aria-label={`${label} pagination`}>
      <span className={muted}>{total} {label} · {total ? page * PAGE_SIZE + 1 : 0}–{Math.min((page + 1) * PAGE_SIZE, total)}</span>
      <button className={button.compactSecondary} disabled={page === 0} onClick={() => onChange(page - 1)}>Previous</button>
      <button className={button.compactSecondary} disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => onChange(page + 1)}>Next</button>
    </div>
  );
}

export default function AdminPage() {
  const [view, setView] = useState('queue');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [flagPage, setFlagPage] = useState(0);
  const [data, setData] = useState({ items: [], total: 0 });
  const [flagged, setFlagged] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const params = { q: search, skip: page * PAGE_SIZE, limit: PAGE_SIZE };
    const load = view === 'diagnostics' ? adminRequest('diagnostics') : view === 'domains' ? adminRequest(`domains?${new URLSearchParams(params)}`) : view === 'users' ? getAdminUsers(params) : view === 'lookup'
      ? getAdminLinks({ ...params, queue: false }) : getAdminReports({ ...params, open_only: view === 'queue' });
    Promise.all([load, view === 'queue' ? getAdminLinks({ q: search, skip: flagPage * PAGE_SIZE, limit: PAGE_SIZE }) : Promise.resolve({ items: [], total: 0 })])
      .then(([result, flags]) => {
        if (!cancelled) { setData(result); setFlagged(flags); }
      })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [view, search, page, flagPage, revision]);

  function reload() {
    setLoading(true);
    setError('');
    setRevision(value => value + 1);
  }

  function changePage(value) {
    setLoading(true);
    setError('');
    setPage(value);
  }

  async function act(action) {
    setBusy(true);
    setError('');
    try {
      await action();
      // Reset pagination because resolving the last row can remove a page.
      setPage(0);
      setFlagPage(0);
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout>
      <header>
        <p className={eyebrow}>Administration</p>
        <h1 className={`${serif} m-0 text-[clamp(2.6rem,8vw,5.2rem)] leading-[0.88]`}>Review and resolve.</h1>
        <p className={muted}>Handle reports, investigate links, and help account owners.</p>
      </header>
      <nav className="my-6 flex flex-wrap gap-2" aria-label="Administration views">
        {Object.entries({ queue: 'Waiting for review', lookup: 'Find any link', reports: 'Report history', users: 'Accounts', domains: 'Domains', diagnostics: 'Diagnostics' }).map(([key, label]) => (
          <button key={key} aria-pressed={view === key} className={view === key ? button.primary : button.secondary} onClick={() => {
            setView(key); setPage(0); setFlagPage(0); setLoading(true); setError('');
          }}>{label}</button>
        ))}
      </nav>
      {view !== 'diagnostics' && <form className={`${field} mb-6`} onSubmit={event => {
        event.preventDefault(); setSearch(query.trim()); setPage(0); setFlagPage(0); reload();
      }}>
        <label className={fieldLabel} htmlFor="admin-search">{view === 'domains' ? 'Search hostname' : view === 'users' ? 'Search owner email' : 'Search short URL, destination, or owner email'}</label>
        <div className="flex gap-3 max-[520px]:flex-col">
          <input className={input} id="admin-search" type="search" maxLength={2048} value={query} onChange={event => setQuery(event.target.value)} />
          <button className={button.secondary}>Search</button>
        </div>
      </form>}
      {view === 'diagnostics' && <button className={button.secondary} disabled={loading} onClick={reload}>Refresh diagnostics</button>}
      {error && <p role="alert" className={alert}>{error}</p>}
      {loading ? <p role="status" className={muted}>Loading…</p> : !error && (
        <>
          {view === 'diagnostics' ? <Diagnostics data={data} /> : view === 'queue' || view === 'reports' ? (
            <section className={panel}>
              <h2 className={panelTitle}>{view === 'queue' ? 'Open reports.' : 'Report history.'}</h2>
              {!data.items.length && <p className={muted}>{view === 'queue' && !search ? 'No reports are waiting for review.' : 'No matching reports.'}</p>}
              <label className={fieldLabel}>Reason for the next review or moderation action
                <input className={input} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} placeholder="Explain the decision" />
              </label>
              {data.items.map(report => (
                <article key={report.id} className={dataRow}>
                  <div>
                    <strong className={dataTitle}>{report.link?.short_url || report.short_url}</strong>
                    {report.link && <>
                      <p className={dataText}>{report.link.url}</p>
                      <p className={dataText}>{report.link.owner_email} · {report.link.is_flagged ? 'Blocked by moderation' : report.link.is_active ? 'Active' : 'Paused by owner'}</p>
                      <p className={dataText}>{report.link.report_count} reports · Latest: {report.link.latest_report_reason}</p>
                    </>}
                    <p className={dataText}>{new Date(report.created_at).toLocaleString()} · {report.reviewed_at ? 'Reviewed' : 'Awaiting review'}{!report.link ? ' · Unresolved link' : ''}</p>
                    <p className={dataText}>Reported URL: {report.short_url}</p>
                    <p className={dataText}>Reason: {report.reason}</p>
                    {report.reporter_email && <p className={dataText}>Reply to: <a href={`mailto:${report.reporter_email}`}>{report.reporter_email}</a></p>}
                  </div>
                  <div className={rowActions}>
                    {report.link && <button disabled={busy || !reason.trim()} className={button.compactDanger} onClick={() => act(() => adminRequest(`links/${report.link.id}/${report.link.is_flagged ? 'clear' : 'flag'}`, { reason }))}>{report.link.is_flagged ? 'Clear block' : 'Block link'}</button>}
                    {!report.reviewed_at && <button disabled={busy || !reason.trim()} className={button.compactSecondary} onClick={() => act(() => adminRequest(`reports/${report.id}/review`, { reason }))}>Mark reviewed</button>}
                  </div>
                </article>
              ))}
              <Pagination total={data.total} page={page} onChange={changePage} label="reports" />
            </section>
          ) : (
            <>
              {!data.items.length && <p className={muted}>No matching {view === 'domains' ? 'domains' : view === 'users' ? 'accounts' : 'links'}.</p>}
              <AdminPanel users={view === 'users' ? data.items : []} links={view === 'lookup' ? data.items : []} domains={view === 'domains' ? data.items : []} onUsersChange={reload} onLinksChange={reload} onDomainsChange={reload} />
              <Pagination total={data.total} page={page} onChange={changePage} label={view === 'domains' ? 'domains' : view === 'users' ? 'users' : 'links'} />
            </>
          )}
          {view === 'queue' && <section className={`${panel} mt-6`}>
            <h2 className={panelTitle}>Flagged links.</h2>
            {!flagged.items.length && <p className={muted}>{search ? 'No matching flagged links.' : 'No flagged links are waiting. Nothing needs your attention here.'}</p>}
            {flagged.items.length > 0 && <AdminPanel links={flagged.items} onLinksChange={() => { setFlagPage(0); reload(); }} />}
            <Pagination total={flagged.total} page={flagPage} onChange={value => { setFlagPage(value); setLoading(true); setError(''); }} label="links" />
          </section>}
        </>
      )}
    </Layout>
  );
}


function Diagnostics({ data }) {
  const time = value => value ? new Date(value).toLocaleString() : 'Not recorded';
  return <section className={panel}>
    <h2 className={panelTitle}>System diagnostics.</h2>
    <p className={muted}>Deployment: {data.cloud_mode ? 'Cloud' : 'Self-hosted'} · Observed: {time(data.observed_at)}</p>
    <p className={dataText}>Database query succeeded: {time(data.database_verified_at)}</p>
    {data.integrations.map(item => <p key={item.name} className={dataText}>{item.name} · Configuration: {item.configured ? 'Available' : 'Incomplete or disabled'} · Health: {item.health} · Observed: {time(item.observed_at)}</p>)}
    <h3 className={dataTitle}>Recent webhook outcomes (latest 30)</h3>
    {!data.recent_webhooks.length && <p className={muted}>No verified Stripe events recorded. Signature failures are rejected before storage.</p>}
    {data.recent_webhooks.map((event, index) => <p key={index} className={dataText}>{event.event_type} · {event.status}{event.failure_reason ? ` · ${event.failure_reason}` : ''} · Received: {time(event.created_at)} · Processed: {time(event.processed_at)}</p>)}
    <h3 className={dataTitle}>Pending hostname / certificate activation ({data.pending_certificates_total}; showing up to 30)</h3>
    <p className={muted}>Stored Cloudflare state combines hostname and TLS activation. Externally managed certificates have no recorded status.</p>
    {data.pending_certificates.map(domain => <p key={domain.id} className={dataText}>{domain.domain} · {domain.owner_email} · {domain.certificate_state} · Record updated: {time(domain.updated_at)} · Last DNS check: {time(domain.last_checked_at)}</p>)}
  </section>;
}
