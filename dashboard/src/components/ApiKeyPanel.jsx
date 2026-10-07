import { useRef, useState } from 'react';
import { createApiKey, revokeApiKey } from '../api/client';
import {
  alert,
  button,
  dataList,
  dataRow,
  dataText,
  dataTitle,
  eyebrow,
  inlineForm,
  input,
  muted,
  panel,
  panelTitle,
  rowActions,
  srOnly,
  status,
} from '../styles/ui';

export default function ApiKeyPanel({ apiKeys, onChange }) {
  const [name, setName] = useState('CLI');
  const [createdToken, setCreatedToken] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState('');
  const [copying, setCopying] = useState(false);
  const [message, setMessage] = useState('');
  const actionRef = useRef(false);
  const copyRef = useRef(false);

  async function handleCreate(event) {
    event.preventDefault();
    if (actionRef.current || createdToken) return;
    actionRef.current = true;
    setPending('creating');
    setError('');
    setMessage('');
    try {
      const created = await createApiKey(name);
      setCreatedToken(created.token);
      onChange([created, ...apiKeys]);
    } catch (err) {
      setError(err.message || 'Could not create the API key. Please try again.');
    } finally {
      actionRef.current = false;
      setPending('');
    }
  }

  async function handleRevoke(item) {
    if (actionRef.current || copyRef.current) return;
    if (!window.confirm(`Revoke ${item.name}?`)) return;
    // Serialize mutations so callbacks cannot overwrite each other's key lists.
    actionRef.current = true;
    setPending(item.id);
    setError('');
    setMessage('');
    try {
      await revokeApiKey(item.id);
      onChange(apiKeys.map(key => (key.id === item.id ? { ...key, is_active: false } : key)));
      setMessage(`${item.name} revoked.`);
    } catch (err) {
      setError(err.message || 'Could not revoke the API key. Please try again.');
    } finally {
      actionRef.current = false;
      setPending('');
    }
  }

  async function copyToken() {
    if (copyRef.current || actionRef.current) return;
    copyRef.current = true;
    setCopying(true);
    setError('');
    setMessage('');
    try {
      await navigator.clipboard.writeText(createdToken);
      setMessage('API key copied.');
    } catch {
      setError('Could not copy the API key. Select the token and copy it manually.');
    } finally {
      copyRef.current = false;
      setCopying(false);
    }
  }

  return (
    <section className={panel}>
      <div>
        <div>
          <p className={eyebrow}>CLI</p>
          <h2 className={panelTitle}>API keys.</h2>
        </div>
      </div>

      <form className={inlineForm} onSubmit={handleCreate}>
        <label htmlFor="api-key-name" className={srOnly}>API key name</label>
        <input
          className={input}
          id="api-key-name"
          type="text"
          value={name}
          onChange={event => setName(event.target.value)}
          maxLength={80}
          disabled={Boolean(pending) || Boolean(createdToken)}
          required
        />
        <button type="submit" className={button.primary} disabled={Boolean(pending) || Boolean(createdToken)}>{pending === 'creating' ? 'Creating' : 'Create'}</button>
      </form>

      {error && <div className={alert} role="alert">{error}</div>}
      {message && <p className={`${status.good} m-0 whitespace-normal`} role="status">{message}</p>}
      {createdToken && (
        <div className="mt-6 grid gap-2 rounded-[20px] border border-[rgba(7,25,54,0.14)] bg-[rgba(217,197,165,0.2)] p-[18px]">
          <strong role="status">API key created. Copy it now.</strong>
          <p className="m-0 text-sm text-[#38516f]">This token is shown only once. You cannot see it again later.</p>
          <span className="font-['JetBrains_Mono',ui-monospace,monospace] text-[#38516f] [overflow-wrap:anywhere]">
            {createdToken}
          </span>
          <div className="flex flex-wrap gap-2.5">
            <button type="button" className={button.secondary} onClick={copyToken} disabled={copying || Boolean(pending)}>{copying ? 'Copying' : 'Copy'}</button>
            <button type="button" className={button.secondary} disabled={copying || Boolean(pending)} onClick={() => { setCreatedToken(''); setMessage(''); setError(''); }}>Done</button>
          </div>
        </div>
      )}

      <div className={dataList}>
        {apiKeys.map(item => (
          <article key={item.id} className={dataRow}>
            <div>
              <strong className={dataTitle}>{item.name}</strong>
              <p className={dataText}>{item.prefix}... created {new Date(item.created_at).toLocaleDateString()}</p>
            </div>
            <div className={rowActions}>
              <span className={item.is_active ? status.good : status.base}>{item.is_active ? 'Active' : 'Revoked'}</span>
              {item.is_active && (
                <button type="button" className={button.compactDanger} onClick={() => handleRevoke(item)} disabled={Boolean(pending) || copying}>
                  {pending === item.id ? 'Revoking' : 'Revoke'}
                </button>
              )}
            </div>
          </article>
        ))}
        {apiKeys.length === 0 && <p className={muted}>No API keys yet.</p>}
      </div>
    </section>
  );
}
