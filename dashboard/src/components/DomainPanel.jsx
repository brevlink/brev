import { useState } from 'react';
import {
  createDomain,
  deleteDomain,
  getDomainMembers,
  getDomainDeletionImpact,
  inviteDomainMember,
  removeDomainMember,
  verifyDomain,
} from '../api/client';
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
import { domainPublishingIssue } from '../utils/domains';

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
const shareForm = 'grid grid-cols-[minmax(0,1fr)_auto] gap-2.5 max-[720px]:grid-cols-1';
const memberRow =
  'flex min-w-0 flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[rgba(7,25,54,0.12)] bg-[rgba(255,250,241,0.62)] px-3 py-2.5';

function memberStatus(member) {
  if (member.status === 'active') return 'Can use it';
  if (member.status === 'expired') return 'Invitation expired';
  return 'Waiting for the invitation to be accepted';
}

export default function DomainPanel({ domains, onChange, onDeleted }) {
  const [domain, setDomain] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [openDomainId, setOpenDomainId] = useState(null);
  const [members, setMembers] = useState({});
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviting, setInviting] = useState(false);
  const [busyDomainId, setBusyDomainId] = useState(null);
  const [checkingDomainId, setCheckingDomainId] = useState(null);

  async function loadMembers(domainId) {
    try {
      const data = await getDomainMembers(domainId);
      setMembers(current => ({ ...current, [domainId]: data.items || [] }));
    } catch {
      // Losing the member list is not worth breaking the panel over.
      setMembers(current => ({ ...current, [domainId]: [] }));
    }
  }

  async function handleToggle(item) {
    const next = openDomainId === item.id ? null : item.id;
    setOpenDomainId(next);
    setInviteEmail('');
    setInviteError('');
    if (next && item.role !== 'member' && !members[item.id]) {
      await loadMembers(item.id);
    }
  }

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
    setBusyDomainId(item.id);
    setCheckingDomainId(item.id);
    try {
      const verified = await verifyDomain(item.id);
      onChange(domains.map(domainItem => (domainItem.id === item.id ? verified : domainItem)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyDomainId(null);
      setCheckingDomainId(null);
    }
  }

  async function handleDelete(item) {
    setError('');
    setBusyDomainId(item.id);
    try {
      // Fetch at confirmation time: the browser cannot count members' links.
      const impact = await getDomainDeletionImpact(item.id);
      if (!window.confirm(
        `Remove ${item.domain}? This will permanently delete ${impact.total_links} links, ` +
        `including ${impact.other_users_links} links belonging to other people. ` +
        'These links will stop working and will not move to the default domain. This cannot be undone.',
      )) return;
      await deleteDomain(item.id);
      onChange(domains.filter(domainItem => domainItem.id !== item.id));
      await onDeleted?.(item.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyDomainId(null);
    }
  }

  async function handleInvite(event, item) {
    event.preventDefault();
    setInviteError('');
    setInviting(true);
    try {
      await inviteDomainMember(item.id, inviteEmail);
      setInviteEmail('');
      await loadMembers(item.id);
    } catch (err) {
      setInviteError(err.message);
    } finally {
      setInviting(false);
    }
  }

  async function handleRemoveMember(item, member) {
    if (!window.confirm(`Stop sharing ${item.domain} with ${member.email}?`)) return;
    setInviteError('');
    try {
      await removeDomainMember(item.id, member.id);
      await loadMembers(item.id);
    } catch (err) {
      setInviteError(err.message);
    }
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
        {domains.map(item => {
          const shared = item.role === 'member';
          return (
            <article key={item.id} className={domainItem}>
              <div className={domainHeader}>
                <div className="min-w-0">
                  <button
                    type="button"
                    className="block w-full max-w-full cursor-pointer border-0 bg-transparent p-0 text-left [font:inherit] font-extrabold text-[#071936] underline decoration-[rgba(7,25,54,0.28)] decoration-1 underline-offset-4 [overflow-wrap:anywhere]"
                    aria-expanded={openDomainId === item.id}
                    onClick={() => handleToggle(item)}
                  >
                    {item.domain}
                  </button>
                  <p className={dataText}>
                    {shared
                      ? `Shared with you by ${item.owner_email || 'the owner'}. Click to see what you can do.`
                      : 'Click the domain to view the DNS records to create.'}
                  </p>
                </div>
                <div className={domainActions}>
                  <span className={item.is_verified ? status.good : status.base}>
                    {item.is_verified ? 'TXT verified' : 'TXT pending'}
                  </span>
                  {item.cloudflare_status != null && (
                    <span className={item.cloudflare_status === 'active' ? status.good : status.base}>
                      {item.cloudflare_status === 'active' ? 'Certificate active' : 'Certificate pending'}
                    </span>
                  )}
                  {!shared && (
                    <button type="button" className={button.compactSecondary} disabled={busyDomainId !== null} onClick={() => handleVerify(item)}>
                      {checkingDomainId === item.id ? 'Checking' : item.is_verified ? 'Check status' : 'Verify'}
                    </button>
                  )}
                  {!shared && (
                    <button type="button" className={button.compactDanger} disabled={busyDomainId !== null} onClick={() => handleDelete(item)}>
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {openDomainId === item.id && shared && (
                <div className="grid min-w-0 max-w-full gap-3 overflow-hidden rounded-[14px] border border-[rgba(7,25,54,0.14)] bg-[rgba(255,250,241,0.5)] p-3.5">
                  <p className={`${dataText} m-0`}>
                    {domainPublishingIssue(item)
                      ? `${domainPublishingIssue(item)} Ask the owner to check status before publishing.`
                      : `You can publish links on ${item.domain}.`}
                    {' '}The DNS records and certificate are managed by the owner.
                  </p>
                  <p className={`${dataText} m-0`}>
                    Only the owner can remove this domain or decide who else uses it. If you no
                    longer need it, ask them to take you off.
                  </p>
                </div>
              )}

              {openDomainId === item.id && !shared && (
                <div className="grid min-w-0 max-w-full gap-3 overflow-hidden rounded-[14px] border border-[rgba(7,25,54,0.14)] bg-[rgba(255,250,241,0.5)] p-3.5">
                  <p className={`${dataText} m-0`}>In your DNS provider, create these records for {item.domain}.</p>
                  <p className={`${dataText} m-0`}>
                    Both are needed: the TXT record proves the domain is yours, the CNAME points the
                    domain at Brev. Changes can take a few minutes to propagate before verification
                    succeeds.
                  </p>
                  {item.cloudflare_status != null && (
                    <p className={`${dataText} m-0`}>
                      TXT verification proves ownership. Publishing also requires an active certificate.
                      If the certificate is pending, confirm the CNAME target and use Check status again.
                    </p>
                  )}
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
                    <section className={`${dnsRecord} [border-top-color:rgba(7,25,54,0.24)]`}>
                      <h3 className="m-0 text-[0.82rem] font-black text-[#071936]">People</h3>
                      <p className={`${dataText} m-0`}>
                        Invite someone to publish links on this domain. They can be invited before
                        they have an account: the invitation is addressed to their email.
                      </p>
                      <form className={shareForm} onSubmit={event => handleInvite(event, item)}>
                        <label htmlFor={`invite-${item.id}`} className={srOnly}>Email to invite</label>
                        <input
                          className={input}
                          id={`invite-${item.id}`}
                          type="email"
                          value={inviteEmail}
                          onChange={event => setInviteEmail(event.target.value)}
                          placeholder="brother@example.com"
                          required
                        />
                        <button type="submit" className={button.compactSecondary} disabled={inviting}>
                          {inviting ? 'Sending' : 'Invite'}
                        </button>
                      </form>
                      {inviteError && <div className={alert}>{inviteError}</div>}
                      {(members[item.id] || []).length === 0 ? (
                        <p className={`${dataText} m-0`}>Not shared with anyone yet.</p>
                      ) : (
                        <div className="grid gap-2">
                          {(members[item.id] || []).map(member => (
                            <div key={member.id} className={memberRow}>
                              <div className="min-w-0">
                                <span className="block font-extrabold [overflow-wrap:anywhere]">{member.email}</span>
                                <span className="text-[0.8rem] text-[#38516f]">{memberStatus(member)}</span>
                              </div>
                              <button
                                type="button"
                                className={button.compactDanger}
                                onClick={() => handleRemoveMember(item, member)}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  </div>
                </div>
              )}
            </article>
          );
        })}
        {domains.length === 0 && <p className={muted}>No custom domains yet.</p>}
      </div>
    </section>
  );
}
