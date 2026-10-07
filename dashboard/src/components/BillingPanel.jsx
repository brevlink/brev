import { useEffect, useRef, useState } from 'react';
import { createCheckoutSession } from '../api/client';
import { alert, button, eyebrow, muted, panel, panelHeadSplit, panelTitle, rowActionsLeft, status } from '../styles/ui';

export default function BillingPanel({ billing, onRefresh }) {
  const [checkoutReturn] = useState(() => new URLSearchParams(window.location.search).get('billing'));
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
    if (confirmationDeadline.current === null) confirmationDeadline.current = Date.now() + 60000;
    // The return URL is not proof of payment. Only persisted access confirms it.
    const timer = setInterval(() => { onRefresh().catch(() => {}); }, 3000);
    const deadline = setTimeout(() => setWaiting(false), Math.max(0, confirmationDeadline.current - Date.now()));
    return () => { clearInterval(timer); clearTimeout(deadline); };
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
    <section className={panel}>
      <div className={panelHeadSplit}>
        <div>
          <p className={eyebrow}>Cloud</p>
          <h2 className={panelTitle}>Billing.</h2>
        </div>
        <span className={billing?.effective_access ? status.good : status.base}>
          {billing?.cloud_mode === false ? 'Self-hosted' : billing?.effective_access ? 'Access active' : 'No Cloud access'}
        </span>
      </div>
      <p className={muted}>
        Plan: {billing?.plan || 'free'} · Custom domains included before billing: {billing?.included_custom_domains ?? 0}
      </p>
      {billing?.billing_type === 'one_time' ? (
        <p className={muted}>One-time Cloud access</p>
      ) : billing?.current_period_end ? (
        <p className={muted}>Legacy subscription period ends {new Date(billing.current_period_end).toLocaleDateString()}</p>
      ) : null}
      {billing?.cloud_mode === false && <p className={muted}>Cloud billing does not apply to this self-hosted deployment.</p>}
      {billing?.purchase_recorded && !billing?.active && <p role="status" className={muted}>A payment is already recorded for this account. Contact support to restore access; do not pay again.</p>}
      {checkoutReturn === 'cancelled' && <p role="status" className={muted}>You returned from checkout without completing it. Current access is shown below.</p>}
      {checkoutReturn === 'success' && <p role="status" className={muted}>{billing?.active
        ? 'Cloud access is active. Billing has been confirmed by the server.'
        : waiting ? 'Checkout returned successfully. Waiting for payment confirmation…'
          : 'Payment confirmation is taking longer than expected. Refresh billing or contact support. Do not pay again.'}</p>}
      {error && <div className={alert} role="alert">{error}</div>}
      {message && <p className={`${status.good} m-0`} role="status">{message}</p>}
      <div className={rowActionsLeft}>
        {billing?.checkout_available && checkoutReturn !== 'success' && <button type="button" className={button.primary} onClick={() => performAction('checkout')} disabled={Boolean(pending)}>
          {pending === 'checkout' ? 'Opening checkout' : 'Buy Cloud access'}
        </button>}
        <button type="button" className={button.secondary} onClick={() => performAction('refresh')} disabled={Boolean(pending)}>
          {pending === 'refresh' ? 'Refreshing' : 'Refresh'}
        </button>
      </div>
    </section>
  );
}
