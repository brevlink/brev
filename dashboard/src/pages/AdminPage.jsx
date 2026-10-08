import {
  Alert,
  Button,
  DataRow,
  DataText,
  DataTitle,
  Eyebrow,
  Field,
  Input,
  Label,
  Muted,
  Panel,
  PanelTitle,
  RowActions,
} from '../components/ui';
import { useEffect, useState } from 'react';
import { getAdminLinks, getAdminReports, getAdminUsers } from '../api/client';
import AdminPanel, { adminRequest } from '../components/AdminPanel';
import Layout from '../components/Layout';

const PAGE_SIZE = 20;

function Pagination({ total, page, onChange, label }) {
  return (
    <div
      className="my-4 flex flex-wrap items-center gap-3"
      aria-label={`${label} pagination`}
    >
      <Muted as="span">
        {total} {label} · {total ? page * PAGE_SIZE + 1 : 0}-
        {Math.min((page + 1) * PAGE_SIZE, total)}
      </Muted>
      <Button
        variant="secondary"
        size="sm"
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
      >
        Previous
      </Button>
      <Button
        variant="secondary"
        size="sm"
        disabled={(page + 1) * PAGE_SIZE >= total}
        onClick={() => onChange(page + 1)}
      >
        Next
      </Button>
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
    const load =
      view === 'diagnostics'
        ? adminRequest('diagnostics')
        : view === 'domains'
          ? adminRequest(`domains?${new URLSearchParams(params)}`)
          : view === 'users'
            ? getAdminUsers(params)
            : view === 'lookup'
              ? getAdminLinks({ ...params, queue: false })
              : getAdminReports({ ...params, open_only: view === 'queue' });
    Promise.all([
      load,
      view === 'queue'
        ? getAdminLinks({
            q: search,
            skip: flagPage * PAGE_SIZE,
            limit: PAGE_SIZE,
          })
        : Promise.resolve({ items: [], total: 0 }),
    ])
      .then(([result, flags]) => {
        if (!cancelled) {
          setData(result);
          setFlagged(flags);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, search, page, flagPage, revision]);

  function reload() {
    setLoading(true);
    setError('');
    setRevision((value) => value + 1);
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
        <Eyebrow>Administration</Eyebrow>
        <h1
          className={`font-display m-0 text-[clamp(2.6rem,8vw,5.2rem)] leading-[0.88]`}
        >
          Review and resolve.
        </h1>
        <Muted>
          Handle reports, investigate links, and help account owners.
        </Muted>
      </header>
      <nav
        className="my-6 flex flex-wrap gap-2"
        aria-label="Administration views"
      >
        {Object.entries({
          queue: 'Waiting for review',
          lookup: 'Find any link',
          reports: 'Report history',
          users: 'Accounts',
          domains: 'Domains',
          diagnostics: 'Diagnostics',
        }).map(([key, label]) => (
          <Button
            key={key}
            aria-pressed={view === key}
            variant={view === key ? 'primary' : 'secondary'}
            onClick={() => {
              setView(key);
              setPage(0);
              setFlagPage(0);
              setLoading(true);
              setError('');
            }}
          >
            {label}
          </Button>
        ))}
      </nav>
      {view !== 'diagnostics' && (
        <Field
          className={`mb-6`}
          as="form"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(query.trim());
            setPage(0);
            setFlagPage(0);
            reload();
          }}
        >
          <Label htmlFor="admin-search">
            {view === 'domains'
              ? 'Search hostname'
              : view === 'users'
                ? 'Search owner email'
                : 'Search short URL, destination, or owner email'}
          </Label>
          <div className="flex gap-3 max-[520px]:flex-col">
            <Input
              id="admin-search"
              type="search"
              maxLength={2048}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Button variant="secondary">Search</Button>
          </div>
        </Field>
      )}
      {view === 'diagnostics' && (
        <Button variant="secondary" disabled={loading} onClick={reload}>
          Refresh diagnostics
        </Button>
      )}
      {error && (
        <Alert role="alert" as="p">
          {error}
        </Alert>
      )}
      {loading ? (
        <Muted role="status">Loading…</Muted>
      ) : (
        !error && (
          <>
            {view === 'diagnostics' ? (
              <Diagnostics data={data} />
            ) : view === 'queue' || view === 'reports' ? (
              <Panel>
                <PanelTitle>
                  {view === 'queue' ? 'Open reports.' : 'Report history.'}
                </PanelTitle>
                {!data.items.length && (
                  <Muted>
                    {view === 'queue' && !search
                      ? 'No reports are waiting for review.'
                      : 'No matching reports.'}
                  </Muted>
                )}
                <Label>
                  Reason for the next review or moderation action
                  <Input
                    maxLength={1000}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Explain the decision"
                  />
                </Label>
                {data.items.map((report) => (
                  <DataRow key={report.id}>
                    <div>
                      <DataTitle>
                        {report.link?.short_url || report.short_url}
                      </DataTitle>
                      {report.link && (
                        <>
                          <DataText>{report.link.url}</DataText>
                          <DataText>
                            {report.link.owner_email} ·{' '}
                            {report.link.is_flagged
                              ? 'Blocked by moderation'
                              : report.link.is_active
                                ? 'Active'
                                : 'Paused by owner'}
                          </DataText>
                          <DataText>
                            {report.link.report_count} reports · Latest:{' '}
                            {report.link.latest_report_reason}
                          </DataText>
                        </>
                      )}
                      <DataText>
                        {new Date(report.created_at).toLocaleString()} ·{' '}
                        {report.reviewed_at ? 'Reviewed' : 'Awaiting review'}
                        {!report.link ? ' · Unresolved link' : ''}
                      </DataText>
                      <DataText>Reported URL: {report.short_url}</DataText>
                      <DataText>Reason: {report.reason}</DataText>
                      {report.reporter_email && (
                        <DataText>
                          Reply to:{' '}
                          <a href={`mailto:${report.reporter_email}`}>
                            {report.reporter_email}
                          </a>
                        </DataText>
                      )}
                    </div>
                    <RowActions>
                      {report.link && (
                        <Button
                          disabled={busy || !reason.trim()}
                          variant="danger"
                          size="sm"
                          onClick={() =>
                            act(() =>
                              adminRequest(
                                `links/${report.link.id}/${report.link.is_flagged ? 'clear' : 'flag'}`,
                                { reason },
                              ),
                            )
                          }
                        >
                          {report.link.is_flagged
                            ? 'Clear block'
                            : 'Block link'}
                        </Button>
                      )}
                      {!report.reviewed_at && (
                        <Button
                          disabled={busy || !reason.trim()}
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            act(() =>
                              adminRequest(`reports/${report.id}/review`, {
                                reason,
                              }),
                            )
                          }
                        >
                          Mark reviewed
                        </Button>
                      )}
                    </RowActions>
                  </DataRow>
                ))}
                <Pagination
                  total={data.total}
                  page={page}
                  onChange={changePage}
                  label="reports"
                />
              </Panel>
            ) : (
              <>
                {!data.items.length && (
                  <Muted>
                    No matching{' '}
                    {view === 'domains'
                      ? 'domains'
                      : view === 'users'
                        ? 'accounts'
                        : 'links'}
                    .
                  </Muted>
                )}
                <AdminPanel
                  users={view === 'users' ? data.items : []}
                  links={view === 'lookup' ? data.items : []}
                  domains={view === 'domains' ? data.items : []}
                  onUsersChange={reload}
                  onLinksChange={reload}
                  onDomainsChange={reload}
                />
                <Pagination
                  total={data.total}
                  page={page}
                  onChange={changePage}
                  label={
                    view === 'domains'
                      ? 'domains'
                      : view === 'users'
                        ? 'users'
                        : 'links'
                  }
                />
              </>
            )}
            {view === 'queue' && (
              <Panel className={`mt-6`}>
                <PanelTitle>Flagged links.</PanelTitle>
                {!flagged.items.length && (
                  <Muted>
                    {search
                      ? 'No matching flagged links.'
                      : 'No flagged links are waiting. Nothing needs your attention here.'}
                  </Muted>
                )}
                {flagged.items.length > 0 && (
                  <AdminPanel
                    links={flagged.items}
                    onLinksChange={() => {
                      setFlagPage(0);
                      reload();
                    }}
                  />
                )}
                <Pagination
                  total={flagged.total}
                  page={flagPage}
                  onChange={(value) => {
                    setFlagPage(value);
                    setLoading(true);
                    setError('');
                  }}
                  label="links"
                />
              </Panel>
            )}
          </>
        )
      )}
    </Layout>
  );
}

function Diagnostics({ data }) {
  const time = (value) =>
    value ? new Date(value).toLocaleString() : 'Not recorded';
  return (
    <Panel>
      <PanelTitle>System diagnostics.</PanelTitle>
      <Muted>
        Deployment: {data.cloud_mode ? 'Cloud' : 'Self-hosted'} · Observed:{' '}
        {time(data.observed_at)}
      </Muted>
      <DataText>
        Database query succeeded: {time(data.database_verified_at)}
      </DataText>
      {data.integrations.map((item) => (
        <DataText key={item.name}>
          {item.name} · Configuration:{' '}
          {item.configured ? 'Available' : 'Incomplete or disabled'} · Health:{' '}
          {item.health} · Observed: {time(item.observed_at)}
        </DataText>
      ))}
      <DataTitle as="h3">Recent webhook outcomes (latest 30)</DataTitle>
      {!data.recent_webhooks.length && (
        <Muted>
          No verified Stripe events recorded. Signature failures are rejected
          before storage.
        </Muted>
      )}
      {data.recent_webhooks.map((event, index) => (
        <DataText key={index}>
          {event.event_type} · {event.status}
          {event.failure_reason ? ` · ${event.failure_reason}` : ''} · Received:{' '}
          {time(event.created_at)} · Processed: {time(event.processed_at)}
        </DataText>
      ))}
      <DataTitle as="h3">
        Pending hostname / certificate activation (
        {data.pending_certificates_total}; showing up to 30)
      </DataTitle>
      <Muted>
        Stored Cloudflare state combines hostname and TLS activation. Externally
        managed certificates have no recorded status.
      </Muted>
      {data.pending_certificates.map((domain) => (
        <DataText key={domain.id}>
          {domain.domain} · {domain.owner_email} · {domain.certificate_state} ·
          Record updated: {time(domain.updated_at)} · Last DNS check:{' '}
          {time(domain.last_checked_at)}
        </DataText>
      ))}
    </Panel>
  );
}
