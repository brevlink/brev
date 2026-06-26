import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../api/client';
import { alert, brand, button, eyebrow, field, fieldLabel, formStack, input, muted, serif } from '../styles/ui';

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
    <main className="grid min-h-screen place-items-center p-6">
      <section className="w-[min(100%,440px)] rounded-[30px] border border-[rgba(7,25,54,0.14)] bg-[rgba(255,250,241,0.58)] p-[34px] shadow-[0_28px_90px_rgba(7,25,54,0.16)]">
        <a href="/" className={`${brand} mb-[34px]`} aria-label="Brev home">
          <img className="size-11 shrink-0 object-contain" src="/brev_logo.webp" alt="" />
          <span>Brev</span>
        </a>
        <p className={eyebrow}>Account</p>
        <h1 className={`${serif} m-0 text-[clamp(2.6rem,8vw,5.2rem)] leading-[0.88] tracking-normal`}>
          {success ? 'Created.' : 'Create account.'}
        </h1>
        <p className={muted}>
          {success ? 'Redirecting to sign in.' : 'Start with the OSS dashboard or Brev Cloud.'}
        </p>

        {!success && (
          <form onSubmit={handleSubmit} className={formStack}>
            {error && <div className={alert}>{error}</div>}

            <div className={field}>
              <label className={fieldLabel} htmlFor="register-email">Email</label>
              <input
                className={input}
                id="register-email"
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>

            <div className={field}>
              <label className={fieldLabel} htmlFor="register-password">Password</label>
              <input
                className={input}
                id="register-password"
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                required
              />
            </div>

            <div className={field}>
              <label className={fieldLabel} htmlFor="confirm-password">Confirm password</label>
              <input
                className={input}
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={event => setConfirm(event.target.value)}
                placeholder="Repeat password"
                required
              />
            </div>

            <button type="submit" className={button.fullPrimary} disabled={loading}>
              {loading ? 'Creating account' : 'Create account'}
            </button>
          </form>
        )}

        <p className="mt-[22px] text-center text-[#38516f] [&_a]:font-extrabold [&_a]:text-[#071936]">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
