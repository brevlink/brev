import { useState } from 'react';
import { createDomain, deleteDomain, verifyDomain } from '../api/client';
import {
  alert,
  button,
  dataList,
  dataText,
  eyebrow,
  inlineForm,
  input,
  muted,
  panel,
  panelTitle,
  srOnly,
  status,
} from '../styles/ui';

const domainItem =
  'grid min-w-0 gap-4 rounded-[18px] border border-[rgba(7,25,54,0.14)] bg-[rgba(255,250,241,0.38)] p-4';
const domainHeader =
  'grid min-w-0 items-start gap-4 [grid-template-columns:minmax(0,1fr)_auto] max-[720px]:grid-cols-1';
const domainActions =
  'flex min-w-max flex-wrap content-start justify-start gap-2 max-[720px]:min-w-0 max-[720px]:w-full';
const dnsRecord =
  'grid min-w-0 gap-2.5 rounded-xl border border-[rgba(7,25,54,0.12)] bg-[rgba(248,241,230,0.68)] p-3';
const dnsLabel = 'text-[0.78rem] font-extrabold text-[#38516f]';
const dnsValue =
  'm-0 max-w-full min-w-0 overflow-x-auto whitespace-nowrap rounded-[10px] border border-[rgba(7,25,54,0.1)] bg-[rgba(255,250,241,0.62)] px-2.5 py-2 font-["JetBrains_Mono",ui-monospace,monospace] text-[0.82rem] text-[#071936] [overflow-wrap:normal]';

export default function DomainPanel({ domains, onChange }) {
  const [domain, setDomain] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [openDomainId, setOpenDomainId] = useState(null);

  async function handleCreate(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const created = await createDomain(domain);
      onChange([created, ...domains]);
      setDomain('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(item) {
    setError('');
    try {
      const verified = await verifyDomain(item.id);
      onChange(domains.map(domainItem => (domainItem.id === item.id ? verified : domainItem)));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(item) {
    if (!window.confirm(`Remove ${item.domain}?`)) return;
    await deleteDomain(item.id);
    onChange(domains.filter(domainItem => domainItem.id !== item.id));
  }

  return (
    <section className={panel}>
      <div>
        <p className={eyebrow}>Domains</p>
        <h2 className={panelTitle}>Custom domains.</h2>
      </div>

      <form className={inlineForm} onSubmit={handleCreate}>
        <label htmlFor="custom-domain" className={srOnly}>Custom domain</label>
        <input
          className={input}
          id="custom-domain"
          type="text"
          value={domain}
          onChange={event => setDomain(event.target.value)}
          placeholder="go.example.com"
          required
        />
        <button type="submit" className={button.primary} disabled={loading}>
          Add
        </button>
      </form>

      {error && <div className={alert}>{error}</div>}

      <div className={dataList}>
        {domains.map(item => (
          <article key={item.id} className={domainItem}>
            <div className={domainHeader}>
              <div className="min-w-0">
                <button
                  type="button"
                  className="block w-full max-w-full cursor-pointer border-0 bg-transparent p-0 text-left [font:inherit] font-extrabold text-[#071936] underline decoration-[rgba(7,25,54,0.28)] decoration-1 underline-offset-4 [overflow-wrap:anywhere]"
                  aria-expanded={openDomainId === item.id}
                  onClick={() => setOpenDomainId(current => (current === item.id ? null : item.id))}
                >
                  {item.domain}
                </button>
                <p className={dataText}>Click the domain to view the DNS records to create.</p>
              </div>
              <div className={domainActions}>
                <span className={item.is_verified ? status.good : status.base}>{item.is_verified ? 'Verified' : 'Pending'}</span>
                {!item.is_verified && (
                  <button type="button" className={button.compactSecondary} onClick={() => handleVerify(item)}>
                    Verify
                  </button>
                )}
                <button type="button" className={button.compactDanger} onClick={() => handleDelete(item)}>
                  Remove
                </button>
              </div>
            </div>

            {openDomainId === item.id && (
              <div className="grid min-w-0 max-w-full gap-3 overflow-hidden rounded-[14px] border border-[rgba(7,25,54,0.14)] bg-[rgba(255,250,241,0.5)] p-3.5">
                <p className={`${dataText} m-0`}>In your DNS provider, create these records for {item.domain}.</p>
                <div className="grid min-w-0 gap-2.5">
                  <section className={dnsRecord}>
                    <h3 className="m-0 text-[0.82rem] font-black text-[#071936]">TXT verification</h3>
                    <dl className="m-0 grid gap-2">
                      <div className="grid min-w-0 items-start gap-1">
                        <dt className={dnsLabel}>Type</dt>
                        <dd className={dnsValue}>TXT</dd>
                      </div>
                      <div className="grid min-w-0 items-start gap-1">
                        <dt className={dnsLabel}>Name / Host</dt>
                        <dd className={dnsValue}>{item.verification_dns_name}</dd>
                      </div>
                      <div className="grid min-w-0 items-start gap-1">
                        <dt className={dnsLabel}>Value</dt>
                        <dd className={dnsValue}>{item.verification_token}</dd>
                      </div>
                    </dl>
                  </section>
                  <section className={`${dnsRecord} [border-top-color:rgba(7,25,54,0.24)]`}>
                    <h3 className="m-0 text-[0.82rem] font-black text-[#071936]">CNAME redirect</h3>
                    <dl className="m-0 grid gap-2">
                      <div className="grid min-w-0 items-start gap-1">
                        <dt className={dnsLabel}>Type</dt>
                        <dd className={dnsValue}>CNAME</dd>
                      </div>
                      <div className="grid min-w-0 items-start gap-1">
                        <dt className={dnsLabel}>Name / Host</dt>
                        <dd className={dnsValue}>{item.domain}</dd>
                      </div>
                      <div className="grid min-w-0 items-start gap-1">
                        <dt className={dnsLabel}>Target / Points to</dt>
                        <dd className={dnsValue}>{item.cname_target}</dd>
                      </div>
                    </dl>
                  </section>
                </div>
              </div>
            )}
          </article>
        ))}
        {domains.length === 0 && <p className={muted}>No custom domains yet.</p>}
      </div>
    </section>
  );
}
