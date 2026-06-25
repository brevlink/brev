import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { logout, me } from '../api/client';

const linkClass = ({ isActive }) => `nav-item ${isActive ? 'active' : ''}`;

export default function Layout({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

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

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <a href="/" className="brand" aria-label="Brev home">
          <img src="/brev_icona.webp" alt="Brev" />
          <span>Brev</span>
        </a>

        <nav className="sidebar-nav" aria-label="Dashboard navigation">
          <NavLink to="/dashboard" end className={linkClass}>
            <span aria-hidden="true">/</span>
            Links
          </NavLink>
          <a className="nav-item" href="https://brevl.ink" target="_blank" rel="noreferrer">
            <span aria-hidden="true">↗</span>
            Landing
          </a>
          <a className="nav-item" href="https://github.com/matteo-genovese/brev" target="_blank" rel="noreferrer">
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
      </aside>

      <main className="main-panel">{children}</main>
    </div>
  );
}
