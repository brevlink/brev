import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getStats } from '../api/client';
import { Alert, Button, EmptyState, Input, Label, Note, PageHeader, Panel } from '../components/ui';

function Ranking({ title, rows, linkRows = false }) {
  return <Panel className="p-5">
    <h2 className="m-0 mb-4 font-display text-2xl">{title}</h2>
    {rows.length === 0 ? <Note>No data for this period.</Note> : <ol className="m-0 list-none p-0">
      {rows.map((row) => <li key={row.short_url || row.name || 'unknown'} className="flex items-center justify-between gap-4 border-b border-line py-3">
        {linkRows ? <Link className="min-w-0 break-all underline" to={`/dashboard/stats/${encodeURIComponent(row.slug)}?host=${encodeURIComponent(new URL(row.short_url).hostname)}`}>{row.short_url}</Link> : <span className="min-w-0 break-all">{row.name || (title === 'Referrers' ? 'Direct / unknown' : 'Unknown')}</span>}
        <strong className="shrink-0 tabular-nums">{row.clicks.toLocaleString()} <span className="sr-only">clicks</span></strong>
      </li>)}
    </ol>}
  </Panel>;
}

function Trend({ series }) {
  const max = Math.max(1, ...series.map((row) => row.clicks));
  const points = series.map((row, index) => `${40 + index * 720 / (series.length - 1)},${180 - row.clicks * 150 / max}`).join(' ');
  return <Panel className="p-5">
    <h2 className="m-0 font-display text-2xl">Daily clicks</h2>
    <svg className="mt-4 w-full text-ink" viewBox="0 0 800 220" role="img" aria-label={`Daily clicks from ${series[0].day} to ${series.at(-1).day}. Peak: ${max}. A data table follows.`}>
      <line x1="40" y1="180" x2="760" y2="180" stroke="currentColor" opacity="0.25" />
      <text x="4" y="35" fill="currentColor" fontSize="14">{max}</text>
      <text x="16" y="184" fill="currentColor" fontSize="14">0</text>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      {series.map((row, index) => <circle key={row.day} cx={40 + index * 720 / (series.length - 1)} cy={180 - row.clicks * 150 / max} r="3" fill="currentColor"><title>{row.day}: {row.clicks} clicks, {row.visitors} daily visitors</title></circle>)}
      <text x="40" y="210" fontSize="14" fill="currentColor">{series[0].day}</text>
      <text x="760" y="210" textAnchor="end" fontSize="14" fill="currentColor">{series.at(-1).day}</text>
    </svg>
    <details className="mt-3"><summary className="cursor-pointer">View daily data</summary>
      <div className="mt-3 max-h-72 overflow-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Daily clicks and visitors, UTC</caption><thead><tr><th scope="col">Day (UTC)</th><th scope="col">Clicks</th><th scope="col">Daily visitors</th></tr></thead><tbody>{series.map((row) => <tr key={row.day}><th scope="row" className="py-2 font-normal">{row.day}</th><td>{row.clicks}</td><td>{row.visitors}</td></tr>)}</tbody></table></div>
    </details>
  </Panel>;
}

export default function StatsPage() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const host = params.get('host');
  const [range, setRange] = useState('30d');
  const [resource, setResource] = useState({ key: '', data: null, error: '' });
  const [revision, setRevision] = useState(0);
  const key = `${slug || ''}:${host || ''}:${range}:${revision}`;
  useEffect(() => {
    let cancelled = false;
    getStats({ slug, host, range }).then((data) => {
      if (!cancelled) setResource({ key, data, error: '' });
    }).catch((error) => {
      if (!cancelled) setResource({ key, data: null, error: error.message });
    });
    return () => { cancelled = true; };
  }, [slug, host, range, revision, key]);
  const { data, error } = resource;
  const loading = resource.key !== key;
  return <>
    <PageHeader title={slug ? 'Link statistics.' : 'Statistics.'} description={slug ? (!loading && data?.link?.short_url || 'Click activity for this link.') : 'Click activity across your links.'} action={slug && <Button as={Link} to="/dashboard/stats">All statistics</Button>} />
    <div className="mb-5 flex flex-wrap items-center gap-3"><Label htmlFor="stats-range">Period</Label><Input as="select" id="stats-range" className="max-w-48" value={range} onChange={(event) => setRange(event.target.value)}><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option></Input></div>
    {loading ? <Panel className="p-8" role="status">Loading statistics…</Panel> : error ? <Alert role="alert"><p>Could not load statistics: {error}</p><Button onClick={() => setRevision((value) => value + 1)}>Retry</Button></Alert> : data && <>
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <Panel className="p-5"><Note>Clicks</Note><strong className="text-4xl tabular-nums">{data.totals.clicks.toLocaleString()}</strong></Panel>
        <Panel className="p-5"><Note>Daily visitors</Note><strong className="text-4xl tabular-nums">{data.totals.visitors.toLocaleString()}</strong></Panel>
      </div>
      <Note className="mb-5">Visitors are counted once per link per UTC day, then summed. Repeat visits across days or links count again. Visits without a usable fingerprint count separately. Known bots and prefetch requests are excluded.</Note>
      {data.totals.clicks === 0 ? <EmptyState title="No clicks in this period.">Share a link or choose a longer period to see its activity.</EmptyState> : <div className="grid gap-5">
        <Trend series={data.series} />
        {!slug && <Ranking title="Most clicked links" rows={data.top_links} linkRows />}
        <Note>Breakdowns use the first visit’s country, referrer and device per link each day. They cover retained events (up to {data.breakdown_retention_days} days); daily totals survive pruning.</Note>
        <div className="grid gap-5 md:grid-cols-2"><Ranking title="Countries" rows={data.countries} /><Ranking title="Referrers" rows={data.referrers} /><Ranking title="Devices" rows={data.devices} /></div>
      </div>}
    </>}
  </>;
}
