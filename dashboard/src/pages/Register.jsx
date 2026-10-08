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
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../api/client';

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
    if (password.length < 12) {
      setError('Password must be at least 12 characters');
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
          {success ? 'Created.' : 'Create account.'}
        </h1>
        <Muted>
          {success
            ? 'Redirecting to sign in.'
            : 'Start with the OSS dashboard or Brev Cloud.'}
        </Muted>

        {!success && (
          <FormStack onSubmit={handleSubmit}>
            {error && <Alert>{error}</Alert>}

            <Field>
              <Label htmlFor="register-email">Email</Label>
              <Input
                id="register-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
            </Field>

            <Field>
              <Label htmlFor="register-password">Password</Label>
              <Input
                id="register-password"
                type="password"
                aria-describedby="register-password-hint"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 12 characters"
                required
              />
              {/* Keep guidance visible while typing; the server enforces the password policy. */}
              <Muted id="register-password-hint" className={`m-0 text-sm`}>
                Use at least 12 characters. Very common passwords are refused.
              </Muted>
            </Field>

            <Field>
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
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
              {loading ? 'Creating account' : 'Create account'}
            </Button>
          </FormStack>
        )}

        <AuthFooter>
          Already registered? <Link to="/login">Sign in</Link>
        </AuthFooter>
      </AuthCard>
    </AuthPage>
  );
}
