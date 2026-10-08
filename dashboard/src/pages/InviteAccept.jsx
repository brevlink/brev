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
import { Link, useLocation } from 'react-router-dom';
import { acceptDomainInvite, fetchDomainInvite, me } from '../api/client';

import { tokenFromFragment } from '../lib/links';

export default function InviteAccept() {
  const location = useLocation();
  const [phase, setPhase] = useState('checking');
  const [invite, setInvite] = useState(null);
  const [detail, setDetail] = useState('');
  const [signedInAs, setSignedInAs] = useState('');

  // Where to return after signing in. The router's own path has no deployment
  // basename, and the fragment has to survive the round trip: that is where the
  // token lives.
  const next = `${location.pathname}${location.search}${location.hash}`;
  const loginLink = `/login?next=${encodeURIComponent(next)}`;

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const token = tokenFromFragment();
      if (!token) {
        setPhase('missing');
        return;
      }
      try {
        const info = await fetchDomainInvite(token);
        if (cancelled) return;
        setInvite(info);
        if (!info.valid) {
          setPhase('invalid');
          return;
        }
        let user = null;
        try {
          user = await me();
        } catch {
          user = null;
        }
        if (cancelled) return;
        if (user) setSignedInAs(user.email || '');
        if (!user) {
          setPhase('need-login');
          return;
        }
        const esito = await acceptDomainInvite(token);
        if (cancelled) return;
        setDetail(esito.email || '');
        setPhase('done');
      } catch (error) {
        if (cancelled) return;
        if (error.status === 403) setPhase('wrong-account');
        else if (error.status === 422) setPhase('expired');
        else if (error.status === 404) setPhase('used');
        else {
          setDetail(error.message);
          setPhase('error');
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  });

  const headings = {
    checking: 'One moment.',
    'need-login': 'Almost there.',
    done: 'You are in.',
    used: 'Already used.',
    expired: 'Expired.',
    invalid: 'Expired.',
    'wrong-account': 'Wrong account.',
    missing: 'Nothing to accept.',
    error: 'Something went wrong.',
  };

  return (
    <AuthPage>
      <AuthCard>
        <Brand href="/" className={`mb-[34px]`} aria-label="Brev home">
          <BrandLogo src={`${import.meta.env.BASE_URL}brev_logo.webp`} alt="" />
          <span>Brev</span>
        </Brand>
        <Eyebrow>Invitation</Eyebrow>
        <h1
          className={`font-display m-0 text-[clamp(2.6rem,8vw,5.2rem)] leading-[0.88] tracking-normal`}
        >
          {headings[phase]}
        </h1>

        {phase === 'checking' && <Muted>Checking your invitation.</Muted>}

        {phase === 'need-login' && (
          <Muted>
            {invite?.invited_by
              ? `${invite.invited_by} invited `
              : 'You were invited '}
            {invite?.email ? `${invite.email} ` : ''}
            to use {invite?.domain}. Sign in with that address to accept.
          </Muted>
        )}

        {phase === 'done' && (
          <Muted>
            {detail ? `${detail} can now ` : 'You can now '}
            publish links on {invite?.domain}. It is in your domains list.
          </Muted>
        )}

        {phase === 'wrong-account' && (
          <Muted>
            This invitation is for {invite?.email}
            {signedInAs ? `, and you are signed in as ${signedInAs}` : ''}. Sign
            in with the address it was sent to.
          </Muted>
        )}

        {phase === 'used' && (
          <Muted>
            This invitation has already been used. If {invite?.domain} is not in
            your domains list, ask for a new invitation.
          </Muted>
        )}

        {(phase === 'expired' || phase === 'invalid') && (
          <Muted>
            This invitation is no longer valid. Ask whoever sent it for a new
            one.
          </Muted>
        )}

        {phase === 'missing' && (
          <Muted>
            This page expects the link from your invitation email. Open that
            link instead.
          </Muted>
        )}

        {phase === 'error' && <Alert>{detail}</Alert>}

        {(phase === 'need-login' || phase === 'wrong-account') && (
          <div className="mt-[22px] grid gap-3">
            <Button
              className={`w-full  no-underline`}
              variant="primary"
              as={Link}
              to={loginLink}
            >
              Sign in
            </Button>
            <Button
              className={`justify-center no-underline`}
              variant="secondary"
              as={Link}
              to="/register"
            >
              Create an account
            </Button>
            <Muted className={`m-0 text-center text-[0.86rem]`}>
              Create it with {invite?.email} or the invitation will not find
              you.
            </Muted>
          </div>
        )}

        {phase === 'done' && (
          <Button
            className={`w-full  mt-[22px] no-underline`}
            variant="primary"
            as={Link}
            to="/dashboard"
          >
            Go to your dashboard
          </Button>
        )}

        {phase !== 'checking' &&
          phase !== 'need-login' &&
          phase !== 'wrong-account' &&
          phase !== 'done' && (
            <AuthFooter>
              <Link to="/dashboard">Go to your dashboard</Link>
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
