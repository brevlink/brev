import { useState } from 'react';
import { Link } from 'react-router-dom';
import { confirmEmailChange } from '../api/client';
import { tokenFromFragment } from '../lib/links';
import { Alert, AuthCard, AuthPage, Button, Muted, PanelTitle } from '../components/ui';

export default function ConfirmEmailChange() {
  const [token] = useState(tokenFromFragment);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  return <AuthPage><AuthCard>
    <PanelTitle as="h1">Confirm your new email.</PanelTitle>
    <Muted>{email ? `Your email is now ${email}.` : 'Confirm this change to use your new email for signing in.'}</Muted>
    {error && <Alert>{error}</Alert>}
    {!token && <Alert>Open the confirmation link from your email.</Alert>}
    {token && !email && <Button disabled={busy} onClick={async () => {
      setBusy(true); setError('');
      try { const result = await confirmEmailChange(token); setEmail(result.email); }
      catch (err) { setError(err.message); }
      finally { setBusy(false); }
    }}>{busy ? 'Confirming…' : 'Confirm email change'}</Button>}
    <Link to="/login">Go to sign in</Link>
  </AuthCard></AuthPage>;
}
