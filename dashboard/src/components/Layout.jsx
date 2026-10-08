import { Alert, Brand, Button, NavTabs } from './ui';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout, me } from '../api/client';

export default function Layout({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [accountStatus, setAccountStatus] = useState('loading');
  const [accountError, setAccountError] = useState('');
  const [revision, setRevision] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    me()
      .then((data) => {
        if (!cancelled) {
          setUser(data);
          setAccountStatus('ready');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setAccountError(err.message || 'Please try again.');
          setAccountStatus('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [revision]);

  async function handleLogout() {
    await logout().catch(() => {});
    navigate('/login', { replace: true });
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <div className="grid min-h-screen grid-cols-[280px_minmax(0,1fr)] max-[840px]:grid-cols-1">
      <aside className="sticky top-0 flex h-screen flex-col border-r border-ink/14 bg-surface/78 p-6 backdrop-blur-[18px] max-[840px]:static max-[840px]:z-10 max-[840px]:h-auto max-[840px]:p-4">
        <div className="flex items-center justify-between gap-4">
          <Brand href="/" aria-label="Brev home" onClick={closeMenu}>
            <img
              className="size-7 shrink-0 object-contain"
              src={`${import.meta.env.BASE_URL}brev_icona.webp`}
              alt="Brev"
            />
            <span>Brev</span>
          </Brand>
          <div className="hidden max-[840px]:block">
            <Button
              type="button"
              size="icon"
              aria-expanded={menuOpen}
              aria-controls="dashboard-menu"
              onClick={() => setMenuOpen((current) => !current)}
            >
              <span className="sr-only">
                {menuOpen ? 'Close menu' : 'Open menu'}
              </span>
              {/* Geometria fissa: tre barre da 2px larghe 18px, distanza 4px.
                Le due esterne ruotano su se stesse per formare la X quando il
                menu e' aperto; quella centrale sparisce. */}
              <span
                className="flex h-[14px] w-[18px] flex-col justify-between"
                aria-hidden="true"
              >
                <span
                  className={`h-0.5 w-full origin-center rounded-full bg-current transition-transform duration-(--duration-navigation) ${menuOpen ? 'translate-y-[6px] rotate-45' : ''}`}
                />
                <span
                  className={`h-0.5 w-full rounded-full bg-current transition-opacity duration-(--duration-navigation) ${menuOpen ? 'opacity-0' : ''}`}
                />
                <span
                  className={`h-0.5 w-full origin-center rounded-full bg-current transition-transform duration-(--duration-navigation) ${menuOpen ? '-translate-y-[6px] -rotate-45' : ''}`}
                />
              </span>
            </Button>
          </div>
        </div>

        <div
          id="dashboard-menu"
          className={`flex flex-1 flex-col ${menuOpen ? 'max-[840px]:block' : 'max-[840px]:hidden'}`}
        >
          <NavTabs
            vertical
            className="mt-11 max-[840px]:mt-5"
            aria-label="Dashboard navigation"
            onNavigate={closeMenu}
            items={[
              { to: '/dashboard/links', label: 'Links' },
              { to: '/dashboard/domains', label: 'Domains' },
              { to: '/dashboard/account', label: 'Account' },
              ...(user?.is_admin
                ? [{ to: '/admin', label: 'Administration' }]
                : []),
            ]}
          />

          {accountStatus === 'error' && (
            <Alert className={`mt-4`} role="alert">
              <p>Could not load account: {accountError}</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setAccountStatus('loading');
                  setRevision((current) => current + 1);
                }}
              >
                Retry
              </Button>
            </Alert>
          )}
          <div className="mt-auto flex items-center justify-between gap-4 border-t border-ink/14 pt-[22px] max-[840px]:mt-5">
            <div>
              <p className="m-0 max-w-[150px] break-words font-extrabold">
                {accountStatus === 'loading'
                  ? 'Loading account…'
                  : accountStatus === 'error'
                    ? 'Account unavailable'
                    : user.email}
              </p>
              <span className="text-[0.78rem] text-ink-muted">
                Brev Dashboard
              </span>
            </div>
            <Button type="button" variant="ghost" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>
      </aside>

      <main className="mx-auto w-[min(100%-48px,1120px)] py-7 pb-[72px] max-[520px]:w-[min(100%-20px,1120px)]">
        {children}
      </main>
    </div>
  );
}
