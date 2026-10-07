import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  confirmPasswordReset,
  fetchPasswordResetLink,
  requestPasswordReset,
} from '../api/client';
import { alert, brand, button, eyebrow, field, fieldLabel, formStack, input, muted, serif } from '../styles/ui';
import { tokenFromFragment } from '../lib/links';

export default function ResetPassword() {
  const token = tokenFromFragment();
  const navigate = useNavigate();

  const [phase, setPhase] = useState(token ? 'checking' : 'request');
  const [detail, setDetail] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function run() {
      try {
        const link = await fetchPasswordResetLink(token);
        if (cancelled) return;
        if (link.valid) {
          setPhase('confirm');
        } else {
          setPhase('expired');
          setDetail(link.expires_at ? new Date(link.expires_at).toLocaleString() : '');
        }
      } catch (err) {
        if (!cancelled) {
          // 404 means the token is expired or already used: that is the normal
          // end of a reset link, and it should read that way.
          setPhase(err.status === 404 ? 'expired' : 'error');
          setDetail(err.message);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleRequest(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setPhase('requested');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(event) {
    event.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 12) {
      setError('Password must be at least 12 characters');
      return;
    }
    setLoading(true);
    try {
      await confirmPasswordReset(token, password);
      setPhase('changed');
      window.setTimeout(() => navigate('/login'), 1600);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const headings = {
    checking: 'One moment.',
    request: 'Forgot it?',
    requested: 'Check your inbox.',
    confirm: 'Choose a new one.',
    changed: 'Password changed.',
    expired: 'Link expired.',
  };

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <section className="w-[min(100%,440px)] rounded-[30px] border border-[rgba(7,25,54,0.14)] bg-[rgba(255,250,241,0.58)] p-[34px] shadow-[0_28px_90px_rgba(7,25,54,0.16)]">
        <a href="/" className={`${brand} mb-[34px]`} aria-label="Brev home">
          <img className="size-11 shrink-0 object-contain" src="/brev_logo.webp" alt="" />
          <span>Brev</span>
        </a>
        <p className={eyebrow}>Account</p>
        <h1 className={`${serif} m-0 text-[clamp(2.6rem,8vw,5.2rem)] leading-[0.88] tracking-normal`}>
          {headings[phase]}
        </h1>

        {phase === 'checking' && <p className={muted}>Checking your reset link.</p>}
        {phase === 'requested' && (
          <p className={muted}>
            If an account exists for that address, a reset link is on its way. It expires in 30
            minutes.
          </p>
        )}
        {phase === 'changed' && <p className={muted}>Redirecting to sign in.</p>}
        {phase === 'expired' && (
          <p className={muted}>
            {detail || 'This reset link is no longer valid.'} Ask for a new one below.
          </p>
        )}
        {phase === 'error' && <div className={alert}>{detail}</div>}

        {(phase === 'request' || phase === 'expired') && (
          <form onSubmit={handleRequest} className={formStack}>
            {error && <div className={alert}>{error}</div>}
            <div className={field}>
              <label className={fieldLabel} htmlFor="reset-email">Email</label>
              <input
                className={input}
                id="reset-email"
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <button type="submit" className={button.fullPrimary} disabled={loading}>
              {loading ? 'Sending' : 'Send reset link'}
            </button>
          </form>
        )}

        {phase === 'confirm' && (
          <form onSubmit={handleConfirm} className={formStack}>
            {error && <div className={alert}>{error}</div>}
            <div className={field}>
              <label className={fieldLabel} htmlFor="reset-password">New password</label>
              <input
                className={input}
                id="reset-password"
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder="At least 12 characters"
                required
              />
            </div>
            <div className={field}>
              <label className={fieldLabel} htmlFor="reset-confirm">Confirm password</label>
              <input
                className={input}
                id="reset-confirm"
                type="password"
                value={confirm}
                onChange={event => setConfirm(event.target.value)}
                placeholder="Repeat password"
                required
              />
            </div>
            <button type="submit" className={button.fullPrimary} disabled={loading}>
              {loading ? 'Saving' : 'Set new password'}
            </button>
          </form>
        )}

        <p className="mt-[22px] text-center text-[#38516f] [&_a]:font-extrabold [&_a]:text-[#071936]">
          <Link to="/login">Back to sign in</Link>
        </p>
      </section>
    </main>
  );
}
