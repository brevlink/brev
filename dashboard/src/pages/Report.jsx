import { useState } from 'react';
import { submitReport } from '../api/client';
import { alert, brand, button, eyebrow, field, fieldLabel, formStack, input, muted, panel, panelTitle } from '../styles/ui';

export default function Report() {
  const [shortUrl, setShortUrl] = useState('');
  const [reason, setReason] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await submitReport({ short_url: shortUrl.trim(), reason: reason.trim(), reporter_email: email.trim() || null });
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-screen w-[min(100%-32px,560px)] content-center py-10">
      <section className={panel}>
        <a href="/" className={brand}>Brev</a>
        <p className={eyebrow}>Abuse and support</p>
        <h1 className={panelTitle}>Report a link.</h1>
        {submitted ? (
          <p role="status" className={muted}>Thank you. Your report has been submitted for review.</p>
        ) : (
          <>
            <p className={muted}>Tell us about a harmful link or a problem you encountered. No account is needed. You can report a link even if it no longer works.</p>
            <form className={formStack} onSubmit={handleSubmit}>
              {error && <p role="alert" className={alert}>{error}</p>}
              <div className={field}>
                <label className={fieldLabel} htmlFor="short-url">Short URL or slug</label>
                <input id="short-url" className={input} required maxLength={2048} value={shortUrl} onChange={event => setShortUrl(event.target.value)} placeholder="https://brevl.ink/example" />
                <span className={muted}>For a custom domain, paste the full short URL.</span>
              </div>
              <div className={field}>
                <label className={fieldLabel} htmlFor="reason">What happened?</label>
                <textarea id="reason" className={`${input} py-3`} required maxLength={2000} rows={4} value={reason} onChange={event => setReason(event.target.value)} />
              </div>
              <div className={field}>
                <label className={fieldLabel} htmlFor="reporter-email">Email for a reply (optional)</label>
                <input id="reporter-email" className={input} type="email" maxLength={320} value={email} onChange={event => setEmail(event.target.value)} />
              </div>
              <button className={button.primary} disabled={busy}>{busy ? 'Submitting…' : 'Submit report'}</button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
