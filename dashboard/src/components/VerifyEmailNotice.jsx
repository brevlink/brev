import { Alert, Button, Eyebrow, Muted, Panel } from './ui';
import { useState } from 'react';
import { resendVerification } from '../api/client';

/**
 * The backend reports effective access, including the deployment setting and
 * admin exemption, so an optional reminder never promises a lock that isn't there.
 */
export default function VerifyEmailNotice({ email, canUseFeatures }) {
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');

  async function handleResend() {
    setState('sending');
    setError('');
    try {
      await resendVerification();
      setState('sent');
    } catch (err) {
      setState('failed');
      setError(err.message);
    }
  }

  return (
    <Panel className={`mb-6`} aria-label="Email verification">
      <Eyebrow>Account</Eyebrow>
      <h2 className={`font-display m-0 text-[1.9rem] leading-[1]`}>
        Confirm your email.
      </h2>
      <Muted>
        {email ? `We sent a confirmation link to ${email}. ` : ''}
        {canUseFeatures === false
          ? 'You can sign in, but links, domains and API keys stay locked until you confirm.'
          : canUseFeatures === true
            ? 'Please confirm your email. You can keep using links, domains and API keys while your email is unconfirmed.'
            : 'Please confirm your email using the confirmation link.'}
      </Muted>
      {state === 'sent' && (
        <Muted>
          Sent. Check that inbox - and the spam folder, just in case.
        </Muted>
      )}
      {error && <Alert>{error}</Alert>}
      <Button
        type="button"
        variant="secondary"
        onClick={handleResend}
        disabled={state === 'sending'}
      >
        {state === 'sending'
          ? 'Sending'
          : state === 'sent'
            ? 'Send it again'
            : 'Send the confirmation email'}
      </Button>
    </Panel>
  );
}
