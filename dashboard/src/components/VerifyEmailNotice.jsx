import { useState } from 'react';
import { resendVerification } from '../api/client';
import { alert, button, eyebrow, muted, panel, serif } from '../styles/ui';

/**
 * Shown while the account is not confirmed. Saying what stays locked matters:
 * the backend answers 403 on links, domains and API keys, and without this
 * notice the user meets that refusal with no explanation and no way out.
 */
export default function VerifyEmailNotice({ email }) {
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
    <section className={`${panel} mb-6`} aria-label="Email verification">
      <p className={eyebrow}>Account</p>
      <h2 className={`${serif} m-0 text-[1.9rem] leading-[1]`}>Confirm your email.</h2>
      <p className={muted}>
        {email ? `We sent a confirmation link to ${email}. ` : ''}
        You can sign in, but links, domains and API keys stay locked until you confirm.
      </p>
      {state === 'sent' && (
        <p className={muted}>Sent. Check that inbox — and the spam folder, just in case.</p>
      )}
      {error && <div className={alert}>{error}</div>}
      <button
        type="button"
        className={button.secondary}
        onClick={handleResend}
        disabled={state === 'sending'}
      >
        {state === 'sending' ? 'Sending' : state === 'sent' ? 'Send it again' : 'Send the confirmation email'}
      </button>
    </section>
  );
}
