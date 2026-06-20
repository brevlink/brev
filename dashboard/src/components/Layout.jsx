import { NavLink, useNavigate } from 'react-router-dom';
import { logout, me } from '../api/client';
import { useState, useEffect } from 'react';

export default function Layout({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  useEffect(() => {
    me().then(setUser).catch(() => {});
  }, []);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
      isActive
        ? 'bg-[#3b82f6]/10 text-[#3b82f6] border border-[#3b82f6]/20'
        : 'text-white/50 hover:text-white hover:bg-white/[0.04]'
    }`;

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 sidebar-glass flex flex-col shrink-0">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-white/10">
          <a href="/" className="flex items-center gap-2.5">
            <img src="/logo-200.png" alt="Brev" className="w-8 h-8" />
            <span className="text-lg font-semibold tracking-tight">Brev</span>
          </a>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-4 py-6 space-y-1">
          <NavLink to="/dashboard" end className={linkClass}>
            <span className="text-lg">🔗</span>
            My Links
          </NavLink>
          <a
            href="https://brevl.ink"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-white/50 hover:text-white hover:bg-white/[0.04] transition-all"
          >
            <span className="text-lg">🌐</span>
            Landing page
          </a>
          <a
            href="https://github.com/matteo-genovese/brev"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-white/50 hover:text-white hover:bg-white/[0.04] transition-all"
          >
            <span className="text-lg">📂</span>
            GitHub
          </a>
        </nav>

        {/* User */}
        <div className="px-4 py-4 border-t border-white/10">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user?.email || '…'}</p>
              <p className="text-xs text-white/40">Dashboard</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.05] text-white/40 hover:text-white hover:bg-white/[0.1] transition-all"
              title="Sign out"
            >
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto scrollbar-thin">
        <div className="max-w-5xl mx-auto px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}