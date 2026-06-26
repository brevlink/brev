import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login } from '../api/client';
import { alert, brand, button, eyebrow, field, fieldLabel, formStack, input, muted, serif } from '../styles/ui';

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
    <main className="grid min-h-screen place-items-center p-6">
      <section className="w-[min(100%,440px)] rounded-[30px] border border-[rgba(7,25,54,0.14)] bg-[rgba(255,250,241,0.58)] p-[34px] shadow-[0_28px_90px_rgba(7,25,54,0.16)]">
        <a href="/" className={`${brand} mb-[34px]`} aria-label="Brev home">
          <img className="size-11 shrink-0 object-contain" src="/brev_logo.webp" alt="" />
          <span>Brev</span>
        </a>
        <p className={eyebrow}>Dashboard</p>
        <h1 className={`${serif} m-0 text-[clamp(2.6rem,8vw,5.2rem)] leading-[0.88] tracking-normal`}>Welcome back.</h1>
        <p className={muted}>Sign in to manage short links, clicks, and domains.</p>

        <form onSubmit={handleSubmit} className={formStack}>
          {error && <div className={alert}>{error}</div>}

          <div className={field}>
            <label className={fieldLabel} htmlFor="email">Email</label>
            <input
              className={input}
              id="email"
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className={field}>
            <label className={fieldLabel} htmlFor="password">Password</label>
            <input
              className={input}
              id="password"
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              required
            />
          </div>

          <button type="submit" className={button.fullPrimary} disabled={loading}>
            {loading ? 'Signing in' : 'Sign in'}
          </button>
        </form>

        <p className="mt-[22px] text-center text-[#38516f] [&_a]:font-extrabold [&_a]:text-[#071936]">
          No account yet? <Link to="/register">Create one</Link>
        </p>
      </section>
    </main>
  );
}
