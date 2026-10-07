import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { acceptDomainInvite, fetchDomainInvite, me } from '../api/client';
import { alert, brand, button, eyebrow, muted, serif } from '../styles/ui';
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
    <main className="grid min-h-screen place-items-center p-6">
      <section className="w-[min(100%,440px)] rounded-[30px] border border-[rgba(7,25,54,0.14)] bg-[rgba(255,250,241,0.58)] p-[34px] shadow-[0_28px_90px_rgba(7,25,54,0.16)]">
        <a href="/" className={`${brand} mb-[34px]`} aria-label="Brev home">
          <img className="size-11 shrink-0 object-contain" src="/brev_logo.webp" alt="" />
          <span>Brev</span>
        </a>
        <p className={eyebrow}>Invitation</p>
        <h1 className={`${serif} m-0 text-[clamp(2.6rem,8vw,5.2rem)] leading-[0.88] tracking-normal`}>
          {headings[phase]}
        </h1>

        {phase === 'checking' && <p className={muted}>Checking your invitation.</p>}

        {phase === 'need-login' && (
          <p className={muted}>
            {invite?.invited_by ? `${invite.invited_by} invited ` : 'You were invited '}
            {invite?.email ? `${invite.email} ` : ''}
            to use {invite?.domain}. Sign in with that address to accept.
          </p>
        )}

        {phase === 'done' && (
          <p className={muted}>
            {detail ? `${detail} can now ` : 'You can now '}
            publish links on {invite?.domain}. It is in your domains list.
          </p>
        )}

        {phase === 'wrong-account' && (
          <p className={muted}>
            This invitation is for {invite?.email}
            {signedInAs ? `, and you are signed in as ${signedInAs}` : ''}. Sign in with the
            address it was sent to.
          </p>
        )}

        {phase === 'used' && (
          <p className={muted}>
            This invitation has already been used. If {invite?.domain} is not in your domains
            list, ask for a new invitation.
          </p>
        )}

        {(phase === 'expired' || phase === 'invalid') && (
          <p className={muted}>
            This invitation is no longer valid. Ask whoever sent it for a new one.
          </p>
        )}

        {phase === 'missing' && (
          <p className={muted}>
            This page expects the link from your invitation email. Open that link instead.
          </p>
        )}

        {phase === 'error' && <div className={alert}>{detail}</div>}

        {(phase === 'need-login' || phase === 'wrong-account') && (
          <div className="mt-[22px] grid gap-3">
            <Link className={`${button.fullPrimary} no-underline`} to={loginLink}>
              Sign in
            </Link>
            <Link className={`${button.secondary} justify-center no-underline`} to="/register">
              Create an account
            </Link>
            <p className={`${muted} m-0 text-center text-[0.86rem]`}>
              Create it with {invite?.email} or the invitation will not find you.
            </p>
          </div>
        )}

        {phase === 'done' && (
          <Link className={`${button.fullPrimary} mt-[22px] no-underline`} to="/dashboard">
            Go to your dashboard
          </Link>
        )}

        {phase !== 'checking' && phase !== 'need-login' && phase !== 'wrong-account' && phase !== 'done' && (
          <p className="mt-[22px] text-center text-[#38516f] [&_a]:font-extrabold [&_a]:text-[#071936]">
            <Link to="/dashboard">Go to your dashboard</Link>
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
