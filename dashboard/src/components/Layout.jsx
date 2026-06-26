import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { logout, me } from '../api/client';
import { brand, srOnly, textButton } from '../styles/ui';

const navItem =
  'flex min-h-11 items-center gap-3 rounded-full border border-transparent px-3.5 text-[0.94rem] font-extrabold text-[#38516f] hover:border-[rgba(7,25,54,0.14)] hover:bg-[rgba(255,250,241,0.52)] hover:text-[#071936]';
const linkClass = ({ isActive }) =>
  `${navItem} ${isActive ? 'border-[rgba(7,25,54,0.14)] bg-[rgba(255,250,241,0.52)] text-[#071936]' : ''}`;

export default function Layout({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    me()
      .then(data => {
        if (!cancelled) setUser(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
            className="hidden size-[42px] cursor-pointer place-items-center rounded-full border border-[rgba(7,25,54,0.14)] bg-[rgba(255,250,241,0.52)] text-[#071936] max-[840px]:grid"
            aria-expanded={menuOpen}
            aria-controls="dashboard-menu"
            onClick={() => setMenuOpen(current => !current)}
          >
            <span className={srOnly}>{menuOpen ? 'Close menu' : 'Open menu'}</span>
            <span className="block h-0.5 w-4 rounded-full bg-current" aria-hidden="true" />
            <span className="block h-0.5 w-4 rounded-full bg-current" aria-hidden="true" />
            <span className="block h-0.5 w-4 rounded-full bg-current" aria-hidden="true" />
          </button>
        </div>

        <div
          id="dashboard-menu"
          className={`contents ${menuOpen ? 'max-[840px]:block' : 'max-[840px]:hidden'}`}
        >
          <nav className="mt-11 grid gap-2 max-[840px]:mt-5" aria-label="Dashboard navigation">
            <NavLink to="/dashboard" end className={linkClass} onClick={closeMenu}>
              <span aria-hidden="true">/</span>
              Links
            </NavLink>
            <a className={navItem} href="https://brevl.ink" target="_blank" rel="noreferrer" onClick={closeMenu}>
              <span aria-hidden="true">↗</span>
              Landing
            </a>
            <a
              className={navItem}
              href="https://github.com/brevlink/brev"
              target="_blank"
              rel="noreferrer"
              onClick={closeMenu}
            >
              <span aria-hidden="true">#</span>
              GitHub
            </a>
          </nav>

          <div className="mt-auto flex items-center justify-between gap-4 border-t border-[rgba(7,25,54,0.14)] pt-[22px] max-[840px]:mt-5">
            <div>
              <p className="m-0 max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap font-extrabold">
                {user?.email || 'Signed in'}
              </p>
              <span className="text-[0.78rem] text-[#38516f]">Brev Dashboard</span>
            </div>
            <button type="button" className={textButton} onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </aside>

      <main className="mx-auto w-[min(100%-48px,1120px)] py-14 pb-[72px] max-[520px]:w-[min(100%-20px,1120px)]">
        {children}
      </main>
    </div>
  );
}
