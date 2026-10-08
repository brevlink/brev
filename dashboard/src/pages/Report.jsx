import {
  Alert,
  Brand,
  Button,
  Eyebrow,
  Field,
  FormStack,
  Input,
  Label,
  Muted,
  Panel,
  PanelTitle,
} from '../components/ui';
import { useState } from 'react';
import { submitReport } from '../api/client';

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
      await submitReport({
        short_url: shortUrl.trim(),
        reason: reason.trim(),
        reporter_email: email.trim() || null,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-screen w-[min(100%-32px,560px)] content-center py-10">
      <Panel>
        <Brand href="/">Brev</Brand>
        <Eyebrow>Abuse and support</Eyebrow>
        <PanelTitle as="h1">Report a link.</PanelTitle>
        {submitted ? (
          <Muted role="status">
            Thank you. Your report has been submitted for review.
          </Muted>
        ) : (
          <>
            <Muted>
              Tell us about a harmful link or a problem you encountered. No
              account is needed. You can report a link even if it no longer
              works.
            </Muted>
            <FormStack onSubmit={handleSubmit}>
              {error && (
                <Alert role="alert" as="p">
                  {error}
                </Alert>
              )}
              <Field>
                <Label htmlFor="short-url">Short URL or slug</Label>
                <Input
                  id="short-url"
                  required
                  maxLength={2048}
                  value={shortUrl}
                  onChange={(event) => setShortUrl(event.target.value)}
                  placeholder="https://brevl.ink/example"
                />
                <Muted as="span">
                  For a custom domain, paste the full short URL.
                </Muted>
              </Field>
              <Field>
                <Label htmlFor="reason">What happened?</Label>
                <Input
                  id="reason"
                  className={`py-3`}
                  as="textarea"
                  required
                  maxLength={2000}
                  rows={4}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
              <Field>
                <Label htmlFor="reporter-email">
                  Email for a reply (optional)
                </Label>
                <Input
                  id="reporter-email"
                  type="email"
                  maxLength={320}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
              <Button variant="primary" disabled={busy}>
                {busy ? 'Submitting…' : 'Submit report'}
              </Button>
            </FormStack>
          </>
        )}
      </Panel>
    </main>
  );
}
