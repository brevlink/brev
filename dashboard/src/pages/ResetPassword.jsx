import {
  Alert,
  AuthCard,
  AuthFooter,
  AuthPage,
  Brand,
  BrandLogo,
  Button,
  Eyebrow,
  Field,
  FormStack,
  Input,
  Label,
  Muted,
} from '../components/ui';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  confirmPasswordReset,
  fetchPasswordResetLink,
  requestPasswordReset,
} from '../api/client';

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
          setDetail(
            link.expires_at ? new Date(link.expires_at).toLocaleString() : '',
          );
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

        {phase === 'checking' && <Muted>Checking your reset link.</Muted>}
        {phase === 'requested' && (
          <Muted>
            If an account exists for that address, a reset link is on its way.
            It expires in 30 minutes.
          </Muted>
        )}
        {phase === 'changed' && <Muted>Redirecting to sign in.</Muted>}
        {phase === 'expired' && (
          <Muted>
            {detail || 'This reset link is no longer valid.'} Ask for a new one
            below.
          </Muted>
        )}
        {phase === 'error' && <Alert>{detail}</Alert>}

        {(phase === 'request' || phase === 'expired') && (
          <FormStack onSubmit={handleRequest}>
            {error && <Alert>{error}</Alert>}
            <Field>
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
            </Field>
            <Button
              type="submit"
              className="w-full"
              variant="primary"
              disabled={loading}
            >
              {loading ? 'Sending' : 'Send reset link'}
            </Button>
          </FormStack>
        )}

        {phase === 'confirm' && (
          <FormStack onSubmit={handleConfirm}>
            {error && <Alert>{error}</Alert>}
            <Field>
              <Label htmlFor="reset-password">New password</Label>
              <Input
                id="reset-password"
                type="password"
                aria-describedby="reset-password-hint"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 12 characters"
                required
              />
              {/* Keep guidance visible while typing; the server enforces the password policy. */}
              <Muted id="reset-password-hint" className={`m-0 text-sm`}>
                Use at least 12 characters. Very common passwords are refused.
              </Muted>
            </Field>
            <Field>
              <Label htmlFor="reset-confirm">Confirm password</Label>
              <Input
                id="reset-confirm"
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                placeholder="Repeat password"
                required
              />
            </Field>
            <Button
              type="submit"
              className="w-full"
              variant="primary"
              disabled={loading}
            >
              {loading ? 'Saving' : 'Set new password'}
            </Button>
          </FormStack>
        )}

        <AuthFooter>
          <Link to="/login">Back to sign in</Link>
        </AuthFooter>
      </AuthCard>
    </AuthPage>
  );
}
