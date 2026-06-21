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

  async function handleSubmit(event) {
    event.preventDefault();
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
      window.setTimeout(() => navigate('/login'), 1200);
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
        <p className="eyebrow">Account</p>
        <h1 className="serif">{success ? 'Created.' : 'Create account.'}</h1>
        <p className="muted">
          {success ? 'Redirecting to sign in.' : 'Start with the OSS dashboard or Brev Cloud.'}
        </p>

        {!success && (
          <form onSubmit={handleSubmit} className="form-stack">
            {error && <div className="alert">{error}</div>}

            <div className="field">
              <label htmlFor="register-email">Email</label>
              <input
                id="register-email"
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="register-password">Password</label>
              <input
                id="register-password"
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="confirm-password">Confirm password</label>
              <input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={event => setConfirm(event.target.value)}
                placeholder="Repeat password"
                required
              />
            </div>

            <button type="submit" className="button primary full" disabled={loading}>
              {loading ? 'Creating account' : 'Create account'}
            </button>
          </form>
        )}

        <p className="auth-switch">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
