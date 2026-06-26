import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { logout, me } from '../api/client';

const linkClass = ({ isActive }) => `nav-item ${isActive ? 'active' : ''}`;

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
    <div className={`dashboard-shell ${menuOpen ? 'menu-open' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <a href="/" className="brand" aria-label="Brev home" onClick={closeMenu}>
            <img src="/brev_icona.webp" alt="Brev" />
            <span>Brev</span>
          </a>
          <button
            type="button"
            className="menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="dashboard-menu"
            onClick={() => setMenuOpen(current => !current)}
          >
            <span className="sr-only">{menuOpen ? 'Close menu' : 'Open menu'}</span>
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </button>
        </div>

        <div id="dashboard-menu" className="sidebar-menu">
          <nav className="sidebar-nav" aria-label="Dashboard navigation">
            <NavLink to="/dashboard" end className={linkClass} onClick={closeMenu}>
              <span aria-hidden="true">/</span>
              Links
            </NavLink>
            <a className="nav-item" href="https://brevl.ink" target="_blank" rel="noreferrer" onClick={closeMenu}>
              <span aria-hidden="true">↗</span>
              Landing
            </a>
            <a
              className="nav-item"
              href="https://github.com/brevlink/brev"
              target="_blank"
              rel="noreferrer"
              onClick={closeMenu}
            >
              <span aria-hidden="true">#</span>
              GitHub
            </a>
          </nav>

          <div className="user-panel">
            <div>
              <p>{user?.email || 'Signed in'}</p>
              <span>Brev Dashboard</span>
            </div>
            <button type="button" className="text-button" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </aside>

      <main className="main-panel">{children}</main>
    </div>
  );
}
