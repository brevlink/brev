import { useState } from 'react';
import { activateAdminUser, clearAdminLink, flagAdminLink, setAdminCloudEntitlement, suspendAdminUser } from '../api/client';
import { alert, button, compactRow, dataList, dataText, dataTitle, eyebrow, panel, panelTitle, rowActions } from '../styles/ui';

export default function AdminPanel({ users, links, onUsersChange, onLinksChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function runAction(action) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleUser(user) {
    const updated = user.is_active ? await suspendAdminUser(user.id) : await activateAdminUser(user.id);
    onUsersChange(current => current.map(item => (item.id === user.id ? updated : item)));
  }

  async function toggleCloud(user) {
    const updated = await setAdminCloudEntitlement(user.id, !user.has_cloud_entitlement);
    // Use the saved server response so the list reflects the persisted entitlement.
    onUsersChange(current => current.map(item => (item.id === user.id ? updated : item)));
  }

  async function toggleLink(link) {
    const updated = link.is_flagged ? await clearAdminLink(link.id) : await flagAdminLink(link.id);
    onLinksChange(current => current.map(item => (item.id === link.id ? updated : item)));
  }

  return (
    <section className={`${panel} mt-[18px]`}>
      <div>
        <div>
          <p className={eyebrow}>Admin</p>
          <h2 className={panelTitle}>Users and moderation.</h2>
        </div>
      </div>

      {error && <p role="alert" className={alert}>{error}</p>}
      <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))] max-[840px]:grid-cols-1">
        <div className={dataList}>
          <strong>Users</strong>
          {users.map(user => (
            <article key={user.id} className={compactRow}>
              <div className="min-w-0">
                <strong className={dataTitle}>{user.email}</strong>
                <p className={dataText}>{user.is_admin ? 'Admin' : 'Member'} · {user.is_verified ? 'Verified' : 'Unverified'}</p>
                <p className={dataText}>{user.is_active ? 'Active account' : 'Suspended account'} · {user.has_cloud_entitlement ? 'Cloud access granted' : 'No Cloud access'}</p>
              </div>
              <div className={rowActions}>
                <button type="button" disabled={busy} className={button.compactSecondary} onClick={() => runAction(() => toggleUser(user))}>
                  {user.is_active ? 'Suspend' : 'Activate'}
                </button>
                <button type="button" disabled={busy} className={user.has_cloud_entitlement ? button.compactDanger : button.compactSecondary} onClick={() => runAction(() => toggleCloud(user))}>
                  {user.has_cloud_entitlement ? 'Revoke Cloud' : 'Grant Cloud'}
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className={dataList}>
          <strong>Links</strong>
          {links.map(link => (
            <article key={link.id} className={compactRow}>
              <div className="min-w-0">
                <strong className={dataTitle}>{link.slug}</strong>
                <p className={dataText}>{link.url}</p>
              </div>
              <button type="button" disabled={busy} className={button.compactDanger} onClick={() => runAction(() => toggleLink(link))}>
                {link.is_flagged ? 'Clear' : 'Flag'}
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
