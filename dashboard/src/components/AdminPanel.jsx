import { useState } from 'react';
import { alert, button, dataList, dataRow, dataText, dataTitle, rowActions, fieldLabel, input } from '../styles/ui';

// Admin transport stays here so the dashboard's shared client can evolve independently.
// The helper is colocated to keep this task within its assigned frontend files.
// eslint-disable-next-line react-refresh/only-export-components
export async function adminRequest(path, body, method = 'POST') {
  const response = await fetch(`/api/v1/admin/${path}`, {
    method: body ? method : 'GET', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'Could not complete the admin request.');
  return result;
}

const timestamp = value => value ? new Date(value).toLocaleString() : 'Not recorded';

function AccountDetails({ details }) {
  return <div className="mt-4">
    <p className={dataText}>Effective access: {details.effective_access ? 'Yes' : 'No'} · {details.cloud_mode ? 'Cloud mode' : 'Self-hosted billing bypass'}</p>
    <p className={dataText}>Entitlement: {details.entitlement_status || 'None'} · Source: {details.entitlement_source}{details.source_purchase_id ? ` (${details.source_purchase_id})` : ''}</p>
    <p className={dataText}>Granted: {timestamp(details.entitlement_granted_at)} · Updated: {timestamp(details.entitlement_updated_at)}</p>
    <p className={dataText}>Legacy subscription: {details.legacy_status || 'None'} · Period end: {timestamp(details.legacy_current_period_end)}</p>
    <strong className={dataTitle}>Purchases (latest 100)</strong>
    {!details.purchases.length && <p className={dataText}>No purchase recorded.</p>}
    {details.purchases.map(purchase => <p key={purchase.id} className={dataText}>{purchase.id} · {purchase.status} · Created: {timestamp(purchase.created_at)} · Paid: {timestamp(purchase.paid_at)} · Updated: {timestamp(purchase.updated_at)}</p>)}
    <strong className={dataTitle}>Operator history (latest 100)</strong>
    {!details.actions.length && <p className={dataText}>No operator actions recorded. Actions before this feature are unavailable.</p>}
    {details.actions.map((action, index) => <p key={index} className={dataText}>{timestamp(action.created_at)} · {action.actor_email} ({action.actor_id}) · {action.action} · {action.target_type} {action.target_id} · Reason: {action.reason}</p>)}
    <p className={dataText}>Observed: {timestamp(details.observed_at)}</p>
  </div>;
}

export default function AdminPanel({ users = [], links = [], domains = [], onUsersChange, onLinksChange, onDomainsChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState(null);

  async function runAction(action, onChange) {
    setBusy(true);
    setError('');
    try {
      await action();
      // Reload totals and queue membership as well as the changed row.
      await onChange();
      if (details) setDetails(await adminRequest(`users/${details.user.id}`));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={dataList}>
      {error && <p role="alert" className={alert}>{error}</p>}
      <label className={fieldLabel}>Reason for the next operator action
        <input className={input} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} placeholder="Explain why this change is needed" />
      </label>
      {users.map(user => (
        <article key={user.id} className={dataRow}>
          <div className="min-w-0">
            <strong className={dataTitle}>{user.email}</strong>
            <p className={dataText}>{user.is_admin ? 'Admin' : 'Member'} · {user.is_verified ? 'Verified' : 'Unverified'} · Joined {new Date(user.created_at).toLocaleDateString()}</p>
            <p className={dataText}>{user.is_active ? 'Active account' : 'Suspended account'} · {user.has_cloud_entitlement ? 'Cloud access granted' : 'No Cloud access'}</p>
            {details?.user.id === user.id && <AccountDetails details={details} />}
          </div>
          <div className={rowActions}>
            <button type="button" disabled={busy} className={button.compactSecondary} onClick={async () => {
              setError(''); setBusy(true);
              try { setDetails(details?.user.id === user.id ? null : await adminRequest(`users/${user.id}`)); }
              catch (err) { setError(err.message); }
              finally { setBusy(false); }
            }}>Details</button>
            <button type="button" disabled={busy || !reason.trim()} className={button.compactSecondary} onClick={() => runAction(() => adminRequest(`users/${user.id}/${user.is_active ? 'suspend' : 'activate'}`, { reason }), onUsersChange)}>
              {user.is_active ? 'Suspend' : 'Activate'}
            </button>
            <button type="button" disabled={busy || !reason.trim()} className={user.has_cloud_entitlement ? button.compactDanger : button.compactSecondary} onClick={() => runAction(() => adminRequest(`users/${user.id}/cloud-entitlement`, { active: !user.has_cloud_entitlement, reason }, 'PUT'), onUsersChange)}>
              {user.has_cloud_entitlement ? 'Revoke Cloud' : 'Grant Cloud'}
            </button>
          </div>
        </article>
      ))}
      {domains.map(domain => <article key={domain.id} className={dataRow}>
        <div className="min-w-0">
          <strong className={dataTitle}>{domain.domain}</strong>
          <p className={dataText}>Owner: {domain.owner_email} ({domain.user_id})</p>
          <p className={dataText}>Ownership: {domain.is_verified ? 'Verified' : 'Unverified'} · Verified: {timestamp(domain.verified_at)}</p>
          <p className={dataText}>Hostname / certificate: {domain.certificate_state} · Last DNS check: {timestamp(domain.last_checked_at)} · Record updated: {timestamp(domain.updated_at)}</p>
          <p className={dataText}>{domain.is_suspended ? 'Suspended' : 'Available'} · Created: {timestamp(domain.created_at)}</p>
        </div>
        <div className={rowActions}>
          <button type="button" disabled={busy || !reason.trim()} className={button.compactSecondary} onClick={() => runAction(() => adminRequest(`domains/${domain.id}/${domain.is_suspended ? 'restore' : 'suspend'}`, { reason }), onDomainsChange)}>{domain.is_suspended ? 'Restore' : 'Suspend'}</button>
        </div>
      </article>)}
      {links.map(link => (
        <article key={link.id} className={dataRow}>
          <div className="min-w-0">
            <strong className={dataTitle}>{link.short_url}</strong>
            <p className={dataText}>{link.url}</p>
            <p className={dataText}>{link.owner_email} · {new Date(link.created_at).toLocaleString()}</p>
            <p className={dataText}>{link.is_flagged ? 'Blocked by moderation' : link.is_active ? 'Active' : 'Paused by owner'}{link.is_flagged && !link.is_active ? ' · Paused by owner' : ''}</p>
            {link.report_count > 0 && <p className={dataText}>{link.report_count} reports · Latest: {link.latest_report_reason}</p>}
          </div>
          <div className={rowActions}>
            <button type="button" disabled={busy || !reason.trim()} className={button.compactDanger} onClick={() => runAction(() => adminRequest(`links/${link.id}/${link.is_flagged ? 'clear' : 'flag'}`, { reason }), onLinksChange)}>
              {link.is_flagged ? 'Clear block' : 'Block link'}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
