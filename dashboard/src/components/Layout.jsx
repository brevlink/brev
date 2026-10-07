import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { logout, me } from '../api/client';
import { alert, brand, button, srOnly, textButton } from '../styles/ui';

const navItem =
  'flex min-h-11 items-center gap-3 rounded-full border border-transparent px-3.5 text-[0.94rem] font-extrabold text-[#38516f] hover:border-[rgba(7,25,54,0.14)] hover:bg-[rgba(255,250,241,0.52)] hover:text-[#071936]';
const linkClass = ({ isActive }) =>
  `${navItem} ${isActive ? 'border-[rgba(7,25,54,0.14)] bg-[rgba(255,250,241,0.52)] text-[#071936]' : ''}`;

export default function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [accountStatus, setAccountStatus] = useState('loading');
  const [accountError, setAccountError] = useState('');
  const [revision, setRevision] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    me()
      .then(data => {
        if (!cancelled) { setUser(data); setAccountStatus('ready'); }
      })
      .catch(err => {
        if (!cancelled) { setAccountError(err.message || 'Please try again.'); setAccountStatus('error'); }
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
      <aside className="sticky top-0 flex h-screen flex-col border-r border-[rgba(7,25,54,0.14)] bg-[rgba(248,241,230,0.78)] p-6 backdrop-blur-[18px] max-[840px]:z-10 max-[840px]:h-auto max-[840px]:p-4">
        <div className="flex items-center justify-between gap-4">
          <a href="/" className={brand} aria-label="Brev home" onClick={closeMenu}>
            <img className="size-7 shrink-0 object-contain" src="/brev_icona.webp" alt="Brev" />
            <span>Brev</span>
          </a>
          <button
            type="button"
            className="hidden size-11 shrink-0 cursor-pointer place-items-center rounded-full border border-[rgba(7,25,54,0.24)] bg-[rgba(255,250,241,0.9)] text-[#071936] transition-colors hover:border-[rgba(7,25,54,0.45)] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#071936] active:bg-[rgba(7,25,54,0.08)] max-[840px]:grid"
            aria-expanded={menuOpen}
            aria-controls="dashboard-menu"
            onClick={() => setMenuOpen(current => !current)}
          >
            <span className={srOnly}>{menuOpen ? 'Close menu' : 'Open menu'}</span>
            {/* Geometria fissa: tre barre da 2px larghe 18px, distanza 4px.
                Le due esterne ruotano su se stesse per formare la X quando il
                menu e' aperto; quella centrale sparisce. */}
            <span className="flex h-[14px] w-[18px] flex-col justify-between" aria-hidden="true">
              <span className={`h-0.5 w-full origin-center rounded-full bg-current transition-transform duration-200 ${menuOpen ? 'translate-y-[6px] rotate-45' : ''}`} />
              <span className={`h-0.5 w-full rounded-full bg-current transition-opacity duration-200 ${menuOpen ? 'opacity-0' : ''}`} />
              <span className={`h-0.5 w-full origin-center rounded-full bg-current transition-transform duration-200 ${menuOpen ? '-translate-y-[6px] -rotate-45' : ''}`} />
            </span>
          </button>
        </div>

        <div
          id="dashboard-menu"
          className={`contents ${menuOpen ? 'max-[840px]:block' : 'max-[840px]:hidden'}`}
        >
          <nav className="mt-11 grid gap-2 max-[840px]:mt-5" aria-label="Dashboard navigation">
            {[['', 'Links'], ['#domains', 'Domains'], ['#billing', 'Billing'], ['#api-keys', 'API keys']]
              .filter(([hash]) => hash !== '#billing' || !user?.is_admin)
              .map(([hash, label]) => {
                const active = location.pathname === '/dashboard' && (location.hash === '#links' ? '' : location.hash || '') === hash;
                return <NavLink key={label} to={`/dashboard${hash}`} className={linkClass({ isActive: active })} aria-current={active ? 'page' : false} onClick={closeMenu}>{label}</NavLink>;
              })}
            {user?.is_admin && (
              <NavLink to="/admin" className={linkClass} onClick={closeMenu}>
                <span aria-hidden="true">!</span>
                Administration
              </NavLink>
            )}
          </nav>

          {accountStatus === 'error' && <div className={`${alert} mt-4`} role="alert">
            <p>Could not load account: {accountError}</p>
            <button type="button" className={button.compactSecondary} onClick={() => { setAccountStatus('loading'); setRevision(current => current + 1); }}>Retry</button>
          </div>}
          <div className="mt-auto flex items-center justify-between gap-4 border-t border-[rgba(7,25,54,0.14)] pt-[22px] max-[840px]:mt-5">
            <div>
              <p className="m-0 max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap font-extrabold">
                {accountStatus === 'loading' ? 'Loading account…' : accountStatus === 'error' ? 'Account unavailable' : user.email}
              </p>
              <span className="text-[0.78rem] text-[#38516f]">Brev Dashboard</span>
            </div>
            <button type="button" className={textButton} onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </aside>

      <main className="mx-auto w-[min(100%-48px,1120px)] py-7 pb-[72px] max-[520px]:w-[min(100%-20px,1120px)]">
        {children}
      </main>
    </div>
  );
}
