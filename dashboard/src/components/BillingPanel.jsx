import { createCheckoutSession } from '../api/client';
import { button, eyebrow, muted, panel, panelHeadSplit, panelTitle, rowActionsLeft, status } from '../styles/ui';

async function startCheckout() {
  const session = await createCheckoutSession();
  window.location.href = session.url;
}

export default function BillingPanel({ billing, onRefresh }) {
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
      <div className={rowActionsLeft}>
        <button type="button" className={button.primary} onClick={startCheckout}>
          Upgrade
        </button>
        <button type="button" className={button.secondary} onClick={onRefresh}>
          Refresh
        </button>
      </div>
    </section>
  );
}
