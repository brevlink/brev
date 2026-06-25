import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login } from '../api/client';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <a href="/" className="brand auth-brand" aria-label="Brev home">
          <img src="/brev_logo.webp" alt="" />
          <span>Brev</span>
        </a>
        <p className="eyebrow">Dashboard</p>
        <h1 className="serif">Welcome back.</h1>
        <p className="muted">Sign in to manage short links, clicks, and domains.</p>

        <form onSubmit={handleSubmit} className="form-stack">
          {error && <div className="alert">{error}</div>}

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              required
            />
          </div>

          <button type="submit" className="button primary full" disabled={loading}>
            {loading ? 'Signing in' : 'Sign in'}
          </button>
        </form>

        <p className="auth-switch">
          No account yet? <Link to="/register">Create one</Link>
        </p>
      </section>
    </main>
  );
}
