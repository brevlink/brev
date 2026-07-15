import { activateAdminUser, clearAdminLink, flagAdminLink, suspendAdminUser } from '../api/client';
import { button, compactRow, dataList, dataText, dataTitle, eyebrow, panel, panelTitle } from '../styles/ui';

export default function AdminPanel({ users, links, onUsersChange, onLinksChange }) {
  async function toggleUser(user) {
    const updated = user.is_active ? await suspendAdminUser(user.id) : await activateAdminUser(user.id);
    onUsersChange(users.map(item => (item.id === user.id ? updated : item)));
  }

  async function toggleLink(link) {
    const updated = link.is_flagged ? await clearAdminLink(link.id) : await flagAdminLink(link.id);
    onLinksChange(links.map(item => (item.id === link.id ? updated : item)));
  }

  return (
    <section className={`${panel} mt-[18px]`}>
      <div>
        <div>
          <p className={eyebrow}>Admin</p>
          <h2 className={panelTitle}>Moderation.</h2>
        </div>
      </div>

      <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))] max-[840px]:grid-cols-1">
        <div className={dataList}>
          <strong>Users</strong>
          {users.map(user => (
            <article key={user.id} className={compactRow}>
              <div className="min-w-0">
                <strong className={dataTitle}>{user.email}</strong>
                <p className={dataText}>{user.is_admin ? 'Admin' : 'Member'} · {user.is_verified ? 'Verified' : 'Unverified'}</p>
              </div>
              <button type="button" className={button.compactSecondary} onClick={() => toggleUser(user)}>
                {user.is_active ? 'Suspend' : 'Activate'}
              </button>
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
              <button type="button" className={button.compactDanger} onClick={() => toggleLink(link)}>
                {link.is_flagged ? 'Clear' : 'Flag'}
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
