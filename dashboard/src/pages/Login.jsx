import {
  Alert,
  AuthCard,
  AuthFooter,
  AuthPage,
  Brand,
  Button,
  Eyebrow,
  Field,
  FormStack,
  Input,
  Label,
  Muted,
} from '../components/ui';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { login, me } from '../api/client';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const switchAccount = params.get('switch_account') === '1';

  // Where to land after signing in, so an invitation link survives the trip
  // through this page. Only a relative path is accepted: a "next" pointing at
  // another site would turn sign-in into an open redirect.
  const richiesto = params.get('next') || '';
  const next =
    richiesto.startsWith('/') && !richiesto.startsWith('//')
      ? richiesto
      : '/dashboard';

  useEffect(() => {
    let cancelled = false;
    me()
      .then(() => {
        if (cancelled) return;
        // Invitation recipients may need credentials for a different account.
        if (switchAccount) setCheckingSession(false);
        else navigate(next, { replace: true });
      })
      .catch(() => {
        if (!cancelled) setCheckingSession(false);
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, next, switchAccount]);

  if (checkingSession) {
    return <div className="grid min-h-screen place-items-center p-6">Loading</div>;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthPage>
      <AuthCard>
        <Brand href="/" className={`mb-[34px]`} aria-label="Brev home">
          <span>Brev</span>
        </Brand>
        <Eyebrow>Dashboard</Eyebrow>
        <h1
          className={`font-display m-0 text-[clamp(2.6rem,8vw,5.2rem)] leading-[0.88] tracking-normal`}
        >
          Welcome back.
        </h1>
        <Muted>Sign in to manage short links, clicks, and domains.</Muted>

        {params.get('account') === 'deleted' && (
          <Muted role="status">
            Your account, links, owned domains, memberships, API keys, sessions and tokens have been deleted. Billing records remain anonymized for accounting obligations.
          </Muted>
        )}
        <FormStack onSubmit={handleSubmit}>
          {error && <Alert>{error}</Alert>}

          <Field>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />
          </Field>

          <Field>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 12 characters"
              required
            />
          </Field>

          <Button
            type="submit"
            className="w-full"
            variant="primary"
            disabled={loading}
          >
            {loading ? 'Signing in' : 'Sign in'}
          </Button>
        </FormStack>

        <AuthFooter>
          No account yet? <Link to="/register">Create one</Link>
        </AuthFooter>
      </AuthCard>
    </AuthPage>
  );
}
