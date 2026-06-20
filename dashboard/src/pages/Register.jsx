import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../api/client';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      await register(email, password);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass rounded-2xl p-10 text-center glow max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-green-400/10 flex items-center justify-center mx-auto mb-6 text-3xl">✓</div>
          <h2 className="text-xl font-bold mb-2">Account created!</h2>
          <p className="text-white/50 text-sm">Redirecting to login…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <a href="/" className="inline-flex items-center gap-2 mb-6">
            <img src="/logo-200.png" alt="Brev" className="w-9 h-9" />
            <span className="text-2xl font-bold tracking-tight">Brev</span>
          </a>
          <h1 className="text-2xl font-bold mb-2">Create account</h1>
          <p className="text-white/50 text-sm">Start shortening links in seconds</p>
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
              placeholder="At least 8 characters"
              className="input-dark w-full rounded-xl px-4 py-3 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/60 mb-1.5">Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
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
            {loading ? 'Creating account…' : 'Create account'}
          </button>

          <p className="text-center text-sm text-white/40">
            Already have an account?{' '}
            <Link to="/login" className="text-[#3b82f6] hover:text-[#2563eb] transition-colors">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}