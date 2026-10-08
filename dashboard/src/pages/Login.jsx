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
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { login } from '../api/client';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();

  // Where to land after signing in, so an invitation link survives the trip
  // through this page. Only a relative path is accepted: a "next" pointing at
  // another site would turn sign-in into an open redirect.
  const richiesto = params.get('next') || '';
  const next =
    richiesto.startsWith('/') && !richiesto.startsWith('//')
      ? richiesto
      : '/dashboard';

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
          <BrandLogo src={`${import.meta.env.BASE_URL}brev_logo.webp`} alt="" />
          <span>Brev</span>
        </Brand>
        <Eyebrow>Dashboard</Eyebrow>
        <h1
          className={`font-display m-0 text-[clamp(2.6rem,8vw,5.2rem)] leading-[0.88] tracking-normal`}
        >
          Welcome back.
        </h1>
        <Muted>Sign in to manage short links, clicks, and domains.</Muted>

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
