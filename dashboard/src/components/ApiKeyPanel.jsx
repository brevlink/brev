import { useState } from 'react';
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

  async function handleCreate(event) {
    event.preventDefault();
    setError('');
    setCreatedToken('');
    try {
      const created = await createApiKey(name);
      setCreatedToken(created.token);
      onChange([created, ...apiKeys]);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRevoke(item) {
    if (!window.confirm(`Revoke ${item.name}?`)) return;
    await revokeApiKey(item.id);
    onChange(apiKeys.map(key => (key.id === item.id ? { ...key, is_active: false } : key)));
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
          required
        />
        <button type="submit" className={button.primary}>Create</button>
      </form>

      {error && <div className={alert}>{error}</div>}
      {createdToken && (
        <div className="mt-6 grid gap-2 rounded-[20px] border border-[rgba(7,25,54,0.14)] bg-[rgba(217,197,165,0.2)] p-[18px]">
          <strong>Copy this API key now</strong>
          <span className="font-['JetBrains_Mono',ui-monospace,monospace] text-[#38516f] [overflow-wrap:anywhere]">
            {createdToken}
          </span>
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
                <button type="button" className={button.compactDanger} onClick={() => handleRevoke(item)}>
                  Revoke
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
