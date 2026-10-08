import {
  Alert,
  Button,
  Eyebrow,
  Muted,
  Panel,
  PanelHead,
  PanelTitle,
  RowActions,
  StatusBadge,
} from './ui';
import { useEffect, useRef, useState } from 'react';
import { createCheckoutSession } from '../api/client';

export default function BillingPanel({ billing, onRefresh }) {
  const [checkoutReturn] = useState(() =>
    new URLSearchParams(window.location.search).get('billing'),
  );
  const [waiting, setWaiting] = useState(checkoutReturn === 'success');
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // Prevent duplicate requests even when a second click arrives before rendering.
  const actionRef = useRef(false);
  const confirmationDeadline = useRef(null);

  useEffect(() => {
    if (!['success', 'cancelled'].includes(checkoutReturn)) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('billing');
    window.history.replaceState(window.history.state, '', url);
  }, [checkoutReturn]);

  useEffect(() => {
    if (!waiting || billing?.active) return;
    if (confirmationDeadline.current === null)
      confirmationDeadline.current = Date.now() + 60000;
    // The return URL is not proof of payment. Only persisted access confirms it.
    const timer = setInterval(() => {
      onRefresh().catch(() => {});
    }, 3000);
    const deadline = setTimeout(
      () => setWaiting(false),
      Math.max(0, confirmationDeadline.current - Date.now()),
    );
    return () => {
      clearInterval(timer);
      clearTimeout(deadline);
    };
  }, [waiting, billing?.active, onRefresh]);

  async function performAction(action) {
    if (actionRef.current) return;
    actionRef.current = true;
    setPending(action);
    setError('');
    setMessage('');
    try {
      if (action === 'refresh') {
        await onRefresh();
        setMessage('Billing refreshed.');
      } else {
        const session = await createCheckoutSession();
        window.location.href = session.url;
      }
    } catch (err) {
      setError(err.message || 'Could not update billing. Please try again.');
    } finally {
      actionRef.current = false;
      setPending('');
    }
  }

  return (
    <Panel>
      <PanelHead>
        <div>
          <Eyebrow>Cloud</Eyebrow>
          <PanelTitle>Billing.</PanelTitle>
        </div>
        <StatusBadge tone={billing?.effective_access ? 'success' : 'neutral'}>
          {billing?.cloud_mode === false
            ? 'Self-hosted'
            : billing?.effective_access
              ? 'Access active'
              : 'No Cloud access'}
        </StatusBadge>
      </PanelHead>
      <Muted>
        Plan: {billing?.plan || 'free'} · Custom domains included before
        billing: {billing?.included_custom_domains ?? 0}
      </Muted>
      {billing?.billing_type === 'one_time' ? (
        <Muted>One-time Cloud access</Muted>
      ) : billing?.current_period_end ? (
        <Muted>
          Legacy subscription period ends{' '}
          {new Date(billing.current_period_end).toLocaleDateString()}
        </Muted>
      ) : null}
      {billing?.cloud_mode === false && (
        <Muted>
          Cloud billing does not apply to this self-hosted deployment.
        </Muted>
      )}
      {billing?.purchase_recorded && !billing?.active && (
        <Muted role="status">
          A payment is already recorded for this account. Contact support to
          restore access; do not pay again.
        </Muted>
      )}
      {checkoutReturn === 'cancelled' && (
        <Muted role="status">
          You returned from checkout without completing it. Current access is
          shown below.
        </Muted>
      )}
      {checkoutReturn === 'success' && (
        <Muted role="status">
          {billing?.active
            ? 'Cloud access is active. Billing has been confirmed by the server.'
            : waiting
              ? 'Checkout returned successfully. Waiting for payment confirmation…'
              : 'Payment confirmation is taking longer than expected. Refresh billing or contact support. Do not pay again.'}
        </Muted>
      )}
      {error && <Alert role="alert">{error}</Alert>}
      {message && (
        <StatusBadge className={`m-0`} tone="success" as="p" role="status">
          {message}
        </StatusBadge>
      )}
      <RowActions align="start">
        {billing?.checkout_available && checkoutReturn !== 'success' && (
          <Button
            type="button"
            variant="primary"
            onClick={() => performAction('checkout')}
            disabled={Boolean(pending)}
          >
            {pending === 'checkout' ? 'Opening checkout' : 'Buy Cloud access'}
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          onClick={() => performAction('refresh')}
          disabled={Boolean(pending)}
        >
          {pending === 'refresh' ? 'Refreshing' : 'Refresh'}
        </Button>
      </RowActions>
    </Panel>
  );
}
