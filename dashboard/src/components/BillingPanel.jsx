import { useRef, useState } from 'react';
import { createCheckoutSession } from '../api/client';
import { alert, button, eyebrow, muted, panel, panelHeadSplit, panelTitle, rowActionsLeft, status } from '../styles/ui';

export default function BillingPanel({ billing, onRefresh }) {
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // Prevent duplicate requests even when a second click arrives before rendering.
  const actionRef = useRef(false);

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
        <span className={billing?.active ? status.good : status.base}>
          {billing?.active ? 'Active' : 'Free'}
        </span>
      </div>
      <p className={muted}>
        Plan: {billing?.plan || 'free'} · Custom domains included before billing: {billing?.included_custom_domains ?? 0}
      </p>
      {billing?.billing_type === 'one_time' ? (
        <p className={muted}>One-time Cloud access</p>
      ) : billing?.current_period_end ? (
        <p className={muted}>Renews {new Date(billing.current_period_end).toLocaleDateString()}</p>
      ) : null}
      {error && <div className={alert} role="alert">{error}</div>}
      {message && <p className={`${status.good} m-0`} role="status">{message}</p>}
      <div className={rowActionsLeft}>
        <button type="button" className={button.primary} onClick={() => performAction('checkout')} disabled={Boolean(pending)}>
          {pending === 'checkout' ? 'Opening checkout' : 'Upgrade'}
        </button>
        <button type="button" className={button.secondary} onClick={() => performAction('refresh')} disabled={Boolean(pending)}>
          {pending === 'refresh' ? 'Refreshing' : 'Refresh'}
        </button>
      </div>
    </section>
  );
}
