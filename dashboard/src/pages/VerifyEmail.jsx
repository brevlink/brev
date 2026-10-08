import {
  Alert,
  AuthCard,
  AuthFooter,
  AuthPage,
  Brand,
  BrandLogo,
  Button,
  Eyebrow,
  Muted,
} from '../components/ui';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchVerifyEmailLink, verifyEmail } from '../api/client';

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
          setDetail(
            link.expires_at ? new Date(link.expires_at).toLocaleString() : '',
          );
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
    <AuthPage>
      <AuthCard>
        <Brand href="/" className={`mb-[34px]`} aria-label="Brev home">
          <BrandLogo src={`${import.meta.env.BASE_URL}brev_logo.webp`} alt="" />
          <span>Brev</span>
        </Brand>
        <Eyebrow>Account</Eyebrow>
        <h1
          className={`font-display m-0 text-[clamp(2.6rem,8vw,5.2rem)] leading-[0.88] tracking-normal`}
        >
          {headings[phase]}
        </h1>

        {phase === 'checking' && (
          <Muted>Checking your confirmation link.</Muted>
        )}
        {phase === 'done' && (
          <Muted>
            {detail ? `${detail} is confirmed. ` : ''}You can sign in now.
          </Muted>
        )}
        {phase === 'expired' && (
          <>
            <Muted>
              {detail || 'This confirmation link is no longer valid.'}
            </Muted>
            <Muted>Sign in and ask for a new confirmation email.</Muted>
          </>
        )}
        {phase === 'missing' && (
          <Muted>
            This page expects the link from your confirmation email. Open that
            link instead.
          </Muted>
        )}
        {phase === 'error' && <Alert>{detail}</Alert>}

        {phase !== 'checking' && (
          <AuthFooter>
            <Link to="/login">Go to sign in</Link>
          </AuthFooter>
        )}

        {phase === 'checking' && (
          <Button
            type="button"
            className={`w-full  mt-[22px]`}
            variant="primary"
            disabled
          >
            Working
          </Button>
        )}
      </AuthCard>
    </AuthPage>
  );
}
