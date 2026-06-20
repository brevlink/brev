import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login } from '../api/client';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <a href="/" className="inline-flex items-center gap-2 mb-6">
            <img src="/logo-200.png" alt="Brev" className="w-9 h-9" />
            <span className="text-2xl font-bold tracking-tight">Brev</span>
          </a>
          <h1 className="text-2xl font-bold mb-2">Welcome back</h1>
          <p className="text-white/50 text-sm">Sign in to manage your links</p>
        </div>

        <form onSubmit={handleSubmit} className="glass rounded-2xl p-8 glow space-y-5">
          {error && (
            <div className="text-sm text-red-400 bg-red-400/10 rounded-lg px-4 py-2.5 border border-red-400/20">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-white/60 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="input-dark w-full rounded-xl px-4 py-3 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/60 mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input-dark w-full rounded-xl px-4 py-3 text-sm"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition-all disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="text-center text-sm text-white/40">
            Don't have an account?{' '}
            <Link to="/register" className="text-[#3b82f6] hover:text-[#2563eb] transition-colors">Create one</Link>
          </p>
        </form>
      </div>
    </div>
  );
}