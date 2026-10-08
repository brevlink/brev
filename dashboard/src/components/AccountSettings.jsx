import { useState } from 'react';
import { requestEmailChange, downloadAccountData, getAccountDeletionImpact, deleteAccount } from '../api/client';
import { Alert, Button, Dialog, FieldInput, FormStack, Muted, Panel, PanelTitle, RowActions } from './ui';

export default function AccountSettings({ user }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [domains, setDomains] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function run(action, callback) {
    setBusy(action); setError(''); setMessage('');
    try { await callback(); } catch (err) { setError(err.message); }
    finally { setBusy(''); }
  }
  return <>
    <Panel aria-label="Account settings">
      <PanelTitle>Account settings.</PanelTitle>
      {error && !open && <Alert>{error}</Alert>}
      {message && <Muted role="status">{message}</Muted>}
      <FormStack className="mt-0" onSubmit={event => {
        event.preventDefault();
        run('email', async () => {
          const result = await requestEmailChange(email, password);
          setPassword(''); setMessage(result.message);
        });
      }}>
        <h3 className="m-0">Change email</h3>
        <Muted className="m-0">Current email: {user.email}. Confirm the link sent to your new address within 24 hours. We will also notify your current address.</Muted>
        <FieldInput id="new-email" label="New email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
        <FieldInput id="email-password" label="Current password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
        <Button type="submit" disabled={!!busy}>{busy === 'email' ? 'Sending…' : 'Request email change'}</Button>
      </FormStack>
      <h3 className="m-0">Download your data</h3>
      <Muted className="m-0">Download your profile, links, domains and members, API key metadata and available daily click totals as JSON. API key secrets are excluded.</Muted>
      <Button disabled={!!busy} onClick={() => run('export', async () => { await downloadAccountData(); setMessage('Your data download is ready.'); })}>{busy === 'export' ? 'Preparing…' : 'Download data'}</Button>
    </Panel>
    <Panel aria-label="Danger zone" className="border-danger/40">
      <PanelTitle>Danger zone.</PanelTitle>
      <Muted className="m-0">Permanently delete your account. Cancel any active paid subscription first.</Muted>
      <Button variant="danger" disabled={!!busy} onClick={() => run('impact', async () => {
        const impact = await getAccountDeletionImpact(); setDomains(impact.domains); setOpen(true);
      })}>Delete account</Button>
    </Panel>
    <Dialog open={open} onDismiss={() => { if (!busy) { setOpen(false); setDeletePassword(''); setConfirmation(''); } }} aria-labelledby="delete-account-title" aria-describedby="delete-account-description">
      <PanelTitle id="delete-account-title">Delete your account?</PanelTitle>
      <Muted id="delete-account-description">This permanently removes your account, all links, owned domains, memberships, API keys, sessions and tokens. Invited members lose access to your domains and their links on those domains are deleted. Billing records remain anonymized for accounting obligations. This cannot be undone.</Muted>
      {domains.length > 0 && <><h3>Domains that will be deleted</h3><ul>{domains.map(domain => <li key={domain.id}>{domain.domain}</li>)}</ul></>}
      {error && <Alert>{error}</Alert>}
      <FormStack onSubmit={event => {
        event.preventDefault();
        run('delete', async () => {
          const result = await deleteAccount(deletePassword, confirmation);
          setOpen(false); setMessage(result.message);
          window.location.replace(`${window.location.pathname.startsWith('/app') ? '/app' : ''}/login?account=deleted`);
        });
      }}>
        <FieldInput id="delete-password" data-autofocus label="Current password" type="password" autoComplete="current-password" required value={deletePassword} onChange={e => setDeletePassword(e.target.value)} />
        <FieldInput id="delete-confirmation" label="Type DELETE to confirm" autoComplete="off" required pattern="DELETE" value={confirmation} onChange={e => setConfirmation(e.target.value)} />
        <RowActions><Button type="button" disabled={!!busy} onClick={() => { setOpen(false); setDeletePassword(''); setConfirmation(''); }}>Cancel</Button><Button variant="danger" type="submit" disabled={!!busy || confirmation !== 'DELETE'}>{busy === 'delete' ? 'Deleting…' : 'Permanently delete account'}</Button></RowActions>
      </FormStack>
    </Dialog>
  </>;
}
