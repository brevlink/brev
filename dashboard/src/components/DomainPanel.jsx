import {
  Alert,
  Button,
  DataList,
  DataRow,
  DataText,
  DetailPanel,
  DnsEntry,
  DnsRecord,
  DnsTitle,
  DnsValue,
  Eyebrow,
  InlineForm,
  Input,
  Label,
  Muted,
  Panel,
  PanelHead,
  PanelTitle,
  RowActions,
  StatusBadge,
} from './ui';
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

import { domainPublishingIssue } from '../utils/domains';

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
    // Unknown sharing is different from a successfully loaded empty member list.
    setMembers((current) => ({
      ...current,
      [domainId]: { status: 'loading' },
    }));
    try {
      const data = await getDomainMembers(domainId);
      setMembers((current) => ({
        ...current,
        [domainId]: { status: 'ready', items: data.items || [] },
      }));
    } catch (err) {
      setMembers((current) => ({
        ...current,
        [domainId]: {
          status: 'error',
          error: err.message || 'Please try again.',
        },
      }));
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
      onChange(
        domains.map((domainItem) =>
          domainItem.id === item.id ? verified : domainItem,
        ),
      );
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
      if (
        !window.confirm(
          `Remove ${item.domain}? This will permanently delete ${impact.total_links} links, ` +
            `including ${impact.other_users_links} links belonging to other people. ` +
            'These links will stop working and will not move to the default domain. This cannot be undone.',
        )
      )
        return;
      await deleteDomain(item.id);
      onChange(domains.filter((domainItem) => domainItem.id !== item.id));
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
    if (!window.confirm(`Stop sharing ${item.domain} with ${member.email}?`))
      return;
    setInviteError('');
    try {
      await removeDomainMember(item.id, member.id);
      await loadMembers(item.id);
    } catch (err) {
      setInviteError(err.message);
    }
  }

  return (
    <Panel>
      <div>
        <Eyebrow>Domains</Eyebrow>
        <PanelTitle>Your domains.</PanelTitle>
      </div>

      <InlineForm onSubmit={handleCreate}>
        <Label htmlFor="custom-domain" className="col-span-full">
          Custom domain
        </Label>
        <Input
          id="custom-domain"
          type="text"
          value={domain}
          onChange={(event) => setDomain(event.target.value)}
          placeholder="go.example.com"
          required
        />
        <Button type="submit" variant="primary" disabled={loading}>
          Add
        </Button>
      </InlineForm>

      {error && <Alert>{error}</Alert>}

      <DataList>
        {domains.map((item) => {
          const shared = item.role === 'member';
          return (
            <DataRow key={item.id} stacked>
              <PanelHead>
                <div className="min-w-0">
                  <button
                    type="button"
                    className="block w-full max-w-full cursor-pointer border-0 bg-transparent p-0 text-left [font:inherit] font-extrabold text-ink underline decoration-ink/28 decoration-1 underline-offset-4 [overflow-wrap:anywhere]"
                    aria-expanded={openDomainId === item.id}
                    onClick={() => handleToggle(item)}
                  >
                    {item.domain}
                  </button>
                  <DataText>
                    {shared
                      ? `Shared with you by ${item.owner_email || 'the owner'}. Click to see what you can do.`
                      : 'Click the domain to view the DNS records to create.'}
                  </DataText>
                </div>
                <RowActions align="start">
                  <StatusBadge tone={item.is_verified ? 'success' : 'neutral'}>
                    {item.is_verified ? 'TXT verified' : 'TXT pending'}
                  </StatusBadge>
                  {item.cloudflare_status != null && (
                    <StatusBadge
                      tone={
                        item.cloudflare_status === 'active'
                          ? 'success'
                          : 'neutral'
                      }
                    >
                      {item.cloudflare_status === 'active'
                        ? 'Certificate active'
                        : 'Certificate pending'}
                    </StatusBadge>
                  )}
                  {!shared && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={busyDomainId !== null}
                      onClick={() => handleVerify(item)}
                    >
                      {checkingDomainId === item.id
                        ? 'Checking'
                        : item.is_verified
                          ? 'Check status'
                          : 'Verify'}
                    </Button>
                  )}
                  {!shared && (
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={busyDomainId !== null}
                      onClick={() => handleDelete(item)}
                    >
                      Remove
                    </Button>
                  )}
                </RowActions>
              </PanelHead>

              {openDomainId === item.id && shared && (
                <DetailPanel>
                  <DataText className={`m-0`}>
                    {domainPublishingIssue(item)
                      ? `${domainPublishingIssue(item)} Ask the owner to check status before publishing.`
                      : `You can publish links on ${item.domain}.`}{' '}
                    The DNS records and certificate are managed by the owner.
                  </DataText>
                  <DataText className={`m-0`}>
                    Only the owner can remove this domain or decide who else
                    uses it. If you no longer need it, ask them to take you off.
                  </DataText>
                </DetailPanel>
              )}

              {openDomainId === item.id && !shared && (
                <DetailPanel>
                  <DataText className={`m-0`}>
                    In your DNS provider, create these records for {item.domain}
                    .
                  </DataText>
                  <DataText className={`m-0`}>
                    Both are needed: the TXT record proves the domain is yours,
                    the CNAME points the domain at Brev. Changes can take a few
                    minutes to propagate before verification succeeds.
                  </DataText>
                  {item.cloudflare_status != null && (
                    <DataText className={`m-0`}>
                      TXT verification proves ownership. Publishing also
                      requires an active certificate. If the certificate is
                      pending, confirm the CNAME target and use Check status
                      again.
                    </DataText>
                  )}
                  <div className="grid min-w-0 gap-2.5">
                    <DnsRecord>
                      <DnsTitle>TXT verification</DnsTitle>
                      <dl className="m-0 grid gap-2">
                        <DnsEntry>
                          <Label as="dt">Type</Label>
                          <DnsValue>TXT</DnsValue>
                        </DnsEntry>
                        <DnsEntry>
                          <Label as="dt">Name / Host</Label>
                          <DnsValue>{item.verification_dns_name}</DnsValue>
                        </DnsEntry>
                        <DnsEntry>
                          <Label as="dt">Value</Label>
                          <DnsValue>{item.verification_token}</DnsValue>
                        </DnsEntry>
                      </dl>
                    </DnsRecord>
                    <DnsRecord className="border-t-ink/25">
                      <DnsTitle>CNAME redirect</DnsTitle>
                      <dl className="m-0 grid gap-2">
                        <DnsEntry>
                          <Label as="dt">Type</Label>
                          <DnsValue>CNAME</DnsValue>
                        </DnsEntry>
                        <DnsEntry>
                          <Label as="dt">Name / Host</Label>
                          <DnsValue>{item.domain}</DnsValue>
                        </DnsEntry>
                        <DnsEntry>
                          <Label as="dt">Target / Points to</Label>
                          <DnsValue>{item.cname_target}</DnsValue>
                        </DnsEntry>
                      </dl>
                    </DnsRecord>
                    <DnsRecord className="border-t-ink/25">
                      <DnsTitle>People</DnsTitle>
                      <DataText className={`m-0`}>
                        Invite someone to publish links on this domain. They can
                        be invited before they have an account: the invitation
                        is addressed to their email.
                      </DataText>
                      <InlineForm
                        onSubmit={(event) => handleInvite(event, item)}
                      >
                        <Label
                          htmlFor={`invite-${item.id}`}
                          className="col-span-full"
                        >
                          Email to invite
                        </Label>
                        <Input
                          id={`invite-${item.id}`}
                          type="email"
                          value={inviteEmail}
                          onChange={(event) =>
                            setInviteEmail(event.target.value)
                          }
                          placeholder="brother@example.com"
                          required
                        />
                        <Button
                          type="submit"
                          variant="secondary"
                          size="sm"
                          disabled={inviting}
                        >
                          {inviting ? 'Sending' : 'Invite'}
                        </Button>
                      </InlineForm>
                      {inviteError && <Alert>{inviteError}</Alert>}
                      {!members[item.id] ||
                      members[item.id].status === 'loading' ? (
                        <DataText className={`m-0`} role="status">
                          Loading people…
                        </DataText>
                      ) : members[item.id].status === 'error' ? (
                        <Alert role="alert">
                          <p>Could not load people: {members[item.id].error}</p>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => loadMembers(item.id)}
                          >
                            Retry
                          </Button>
                        </Alert>
                      ) : members[item.id].items.length === 0 ? (
                        <DataText className={`m-0`}>
                          Not shared with anyone yet.
                        </DataText>
                      ) : (
                        <div className="grid gap-2">
                          {members[item.id].items.map((member) => (
                            <DataRow key={member.id} as="div">
                              <div className="min-w-0">
                                <span className="block font-extrabold [overflow-wrap:anywhere]">
                                  {member.email}
                                </span>
                                <span className="text-[0.8rem] text-ink-muted">
                                  {memberStatus(member)}
                                </span>
                              </div>
                              <Button
                                type="button"
                                variant="danger"
                                size="sm"
                                onClick={() => handleRemoveMember(item, member)}
                              >
                                Remove
                              </Button>
                            </DataRow>
                          ))}
                        </div>
                      )}
                    </DnsRecord>
                  </div>
                </DetailPanel>
              )}
            </DataRow>
          );
        })}
        {domains.length === 0 && <Muted>No custom domains yet.</Muted>}
      </DataList>
    </Panel>
  );
}
