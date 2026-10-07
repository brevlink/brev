import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchVerifyEmailLink, verifyEmail } from '../api/client';
import { alert, brand, button, eyebrow, muted, serif } from '../styles/ui';
import { tokenFromFragment } from '../lib/links';

export default function VerifyEmail() {
  const [phase, setPhase] = useState('checking');
  const [detail, setDetail] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const token = tokenFromFragment();
      if (!token) {
        setPhase('missing');
        return;
      }
      try {
        const link = await fetchVerifyEmailLink(token);
        if (cancelled) return;
        if (!link.valid) {
          setPhase('expired');
          setDetail(link.expires_at ? new Date(link.expires_at).toLocaleString() : '');
          return;
        }
        const result = await verifyEmail(token);
        if (cancelled) return;
        setPhase('done');
        setDetail(result.email || '');
      } catch (error) {
        if (cancelled) return;
        // An expired or already-used token comes back as 404, and that is the
        // common case, not a failure: it deserves its own message.
        setPhase(error.status === 404 ? 'expired' : 'error');
        setDetail(error.message);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const headings = {
    checking: 'One moment.',
    done: 'Email confirmed.',
    expired: 'Link expired.',
    missing: 'Nothing to confirm.',
    error: 'Something went wrong.',
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

        {phase === 'checking' && <p className={muted}>Checking your confirmation link.</p>}
        {phase === 'done' && (
          <p className={muted}>
            {detail ? `${detail} is confirmed. ` : ''}You can sign in now.
          </p>
        )}
        {phase === 'expired' && (
          <>
            <p className={muted}>{detail || 'This confirmation link is no longer valid.'}</p>
            <p className={muted}>Sign in and ask for a new confirmation email.</p>
          </>
        )}
        {phase === 'missing' && (
          <p className={muted}>
            This page expects the link from your confirmation email. Open that link instead.
          </p>
        )}
        {phase === 'error' && <div className={alert}>{detail}</div>}

        {phase !== 'checking' && (
          <p className="mt-[22px] text-center text-[#38516f] [&_a]:font-extrabold [&_a]:text-[#071936]">
            <Link to="/login">Go to sign in</Link>
          </p>
        )}

        {phase === 'checking' && (
          <button type="button" className={`${button.fullPrimary} mt-[22px]`} disabled>
            Working
          </button>
        )}
      </section>
    </main>
  );
}
