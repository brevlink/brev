import {
  Alert,
  Button,
  DataList,
  DataRow,
  DataText,
  DataTitle,
  Input,
  Label,
  RowActions,
} from './ui';
import { useState } from 'react';

// Admin transport stays here so the dashboard's shared client can evolve independently.
// The helper is colocated to keep this task within its assigned frontend files.
// eslint-disable-next-line react-refresh/only-export-components
export async function adminRequest(path, body, method = 'POST') {
  const response = await fetch(`/api/v1/admin/${path}`, {
    method: body ? method : 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = response.status === 204 ? {} : await response.json();
  if (!response.ok)
    throw new Error(
      typeof result.detail === 'string'
        ? result.detail
        : 'Could not complete the admin request.',
    );
  return result;
}

const timestamp = (value) =>
  value ? new Date(value).toLocaleString() : 'Not recorded';

function AccountDetails({ details }) {
  return (
    <div className="mt-4">
      <DataText>
        Effective access: {details.effective_access ? 'Yes' : 'No'} ·{' '}
        {details.cloud_mode ? 'Cloud mode' : 'Self-hosted billing bypass'}
      </DataText>
      <DataText>
        Entitlement: {details.entitlement_status || 'None'} · Source:{' '}
        {details.entitlement_source}
        {details.source_purchase_id ? ` (${details.source_purchase_id})` : ''}
      </DataText>
      <DataText>
        Granted: {timestamp(details.entitlement_granted_at)} · Updated:{' '}
        {timestamp(details.entitlement_updated_at)}
      </DataText>
      <DataText>
        Legacy subscription: {details.legacy_status || 'None'} · Period end:{' '}
        {timestamp(details.legacy_current_period_end)}
      </DataText>
      <DataTitle>Purchases (latest 100)</DataTitle>
      {!details.purchases.length && <DataText>No purchase recorded.</DataText>}
      {details.purchases.map((purchase) => (
        <DataText key={purchase.id}>
          {purchase.id} · {purchase.status} · Created:{' '}
          {timestamp(purchase.created_at)} · Paid: {timestamp(purchase.paid_at)}{' '}
          · Updated: {timestamp(purchase.updated_at)}
        </DataText>
      ))}
      <DataTitle>Operator history (latest 100)</DataTitle>
      {!details.actions.length && (
        <DataText>
          No operator actions recorded. Actions before this feature are
          unavailable.
        </DataText>
      )}
      {details.actions.map((action, index) => (
        <DataText key={index}>
          {timestamp(action.created_at)} · {action.actor_email} (
          {action.actor_id}) · {action.action} · {action.target_type}{' '}
          {action.target_id} · Reason: {action.reason}
        </DataText>
      ))}
      <DataText>Observed: {timestamp(details.observed_at)}</DataText>
    </div>
  );
}

export default function AdminPanel({
  users = [],
  links = [],
  domains = [],
  onUsersChange,
  onLinksChange,
  onDomainsChange,
}) {
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
    <DataList>
      {error && (
        <Alert role="alert" as="p">
          {error}
        </Alert>
      )}
      <Label>
        Reason for the next operator action
        <Input
          maxLength={1000}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Explain why this change is needed"
        />
      </Label>
      {users.map((user) => (
        <DataRow key={user.id}>
          <div className="min-w-0">
            <DataTitle>{user.email}</DataTitle>
            <DataText>
              {user.is_admin ? 'Admin' : 'Member'} ·{' '}
              {user.is_verified ? 'Verified' : 'Unverified'} · Joined{' '}
              {new Date(user.created_at).toLocaleDateString()}
            </DataText>
            <DataText>
              {user.is_active ? 'Active account' : 'Suspended account'} ·{' '}
              {user.has_cloud_entitlement
                ? 'Cloud access granted'
                : 'No Cloud access'}
            </DataText>
            {details?.user.id === user.id && (
              <AccountDetails details={details} />
            )}
          </div>
          <RowActions>
            <Button
              type="button"
              disabled={busy}
              variant="secondary"
              size="sm"
              onClick={async () => {
                setError('');
                setBusy(true);
                try {
                  setDetails(
                    details?.user.id === user.id
                      ? null
                      : await adminRequest(`users/${user.id}`),
                  );
                } catch (err) {
                  setError(err.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Details
            </Button>
            <Button
              type="button"
              disabled={busy || !reason.trim()}
              variant="secondary"
              size="sm"
              onClick={() =>
                runAction(
                  () =>
                    adminRequest(
                      `users/${user.id}/${user.is_active ? 'suspend' : 'activate'}`,
                      { reason },
                    ),
                  onUsersChange,
                )
              }
            >
              {user.is_active ? 'Suspend' : 'Activate'}
            </Button>
            <Button
              type="button"
              disabled={busy || !reason.trim()}
              variant={user.has_cloud_entitlement ? 'danger' : 'secondary'}
              size="sm"
              onClick={() =>
                runAction(
                  () =>
                    adminRequest(
                      `users/${user.id}/cloud-entitlement`,
                      { active: !user.has_cloud_entitlement, reason },
                      'PUT',
                    ),
                  onUsersChange,
                )
              }
            >
              {user.has_cloud_entitlement ? 'Revoke Cloud' : 'Grant Cloud'}
            </Button>
          </RowActions>
        </DataRow>
      ))}
      {domains.map((domain) => (
        <DataRow key={domain.id}>
          <div className="min-w-0">
            <DataTitle>{domain.domain}</DataTitle>
            <DataText>
              Owner: {domain.owner_email} ({domain.user_id})
            </DataText>
            <DataText>
              Ownership: {domain.is_verified ? 'Verified' : 'Unverified'} ·
              Verified: {timestamp(domain.verified_at)}
            </DataText>
            <DataText>
              Hostname / certificate: {domain.certificate_state} · Last DNS
              check: {timestamp(domain.last_checked_at)} · Record updated:{' '}
              {timestamp(domain.updated_at)}
            </DataText>
            <DataText>
              {domain.is_suspended ? 'Suspended' : 'Available'} · Created:{' '}
              {timestamp(domain.created_at)}
            </DataText>
          </div>
          <RowActions>
            <Button
              type="button"
              disabled={busy || !reason.trim()}
              variant="secondary"
              size="sm"
              onClick={() =>
                runAction(
                  () =>
                    adminRequest(
                      `domains/${domain.id}/${domain.is_suspended ? 'restore' : 'suspend'}`,
                      { reason },
                    ),
                  onDomainsChange,
                )
              }
            >
              {domain.is_suspended ? 'Restore' : 'Suspend'}
            </Button>
          </RowActions>
        </DataRow>
      ))}
      {links.map((link) => (
        <DataRow key={link.id}>
          <div className="min-w-0">
            <DataTitle>{link.short_url}</DataTitle>
            <DataText>{link.url}</DataText>
            <DataText>
              {link.owner_email} · {new Date(link.created_at).toLocaleString()}
            </DataText>
            <DataText>
              {link.is_flagged
                ? 'Blocked by moderation'
                : link.is_active
                  ? 'Active'
                  : 'Paused by owner'}
              {link.is_flagged && !link.is_active ? ' · Paused by owner' : ''}
            </DataText>
            {link.report_count > 0 && (
              <DataText>
                {link.report_count} reports · Latest:{' '}
                {link.latest_report_reason}
              </DataText>
            )}
          </div>
          <RowActions>
            <Button
              type="button"
              disabled={busy || !reason.trim()}
              variant="danger"
              size="sm"
              onClick={() =>
                runAction(
                  () =>
                    adminRequest(
                      `links/${link.id}/${link.is_flagged ? 'clear' : 'flag'}`,
                      { reason },
                    ),
                  onLinksChange,
                )
              }
            >
              {link.is_flagged ? 'Clear block' : 'Block link'}
            </Button>
          </RowActions>
        </DataRow>
      ))}
    </DataList>
  );
}
