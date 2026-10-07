import { useState } from 'react';
import { activateAdminUser, clearAdminLink, flagAdminLink, setAdminCloudEntitlement, suspendAdminUser } from '../api/client';
import { alert, button, dataList, dataRow, dataText, dataTitle, rowActions } from '../styles/ui';

export default function AdminPanel({ users = [], links = [], onUsersChange, onLinksChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function runAction(action, onChange) {
    setBusy(true);
    setError('');
    try {
      await action();
      // Reload totals and queue membership as well as the changed row.
      onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={dataList}>
      {error && <p role="alert" className={alert}>{error}</p>}
      {users.map(user => (
        <article key={user.id} className={dataRow}>
          <div className="min-w-0">
            <strong className={dataTitle}>{user.email}</strong>
            <p className={dataText}>{user.is_admin ? 'Admin' : 'Member'} · {user.is_verified ? 'Verified' : 'Unverified'} · Joined {new Date(user.created_at).toLocaleDateString()}</p>
            <p className={dataText}>{user.is_active ? 'Active account' : 'Suspended account'} · {user.has_cloud_entitlement ? 'Cloud access granted' : 'No Cloud access'}</p>
          </div>
          <div className={rowActions}>
            <button type="button" disabled={busy} className={button.compactSecondary} onClick={() => runAction(() => user.is_active ? suspendAdminUser(user.id) : activateAdminUser(user.id), onUsersChange)}>
              {user.is_active ? 'Suspend' : 'Activate'}
            </button>
            <button type="button" disabled={busy} className={user.has_cloud_entitlement ? button.compactDanger : button.compactSecondary} onClick={() => runAction(() => setAdminCloudEntitlement(user.id, !user.has_cloud_entitlement), onUsersChange)}>
              {user.has_cloud_entitlement ? 'Revoke Cloud' : 'Grant Cloud'}
            </button>
          </div>
        </article>
      ))}
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
            <button type="button" disabled={busy} className={button.compactDanger} onClick={() => runAction(() => link.is_flagged ? clearAdminLink(link.id) : flagAdminLink(link.id), onLinksChange)}>
              {link.is_flagged ? 'Clear block' : 'Block link'}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
