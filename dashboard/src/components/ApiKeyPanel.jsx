import {
  Alert,
  Button,
  DataList,
  DataRow,
  DataText,
  DataTitle,
  Eyebrow,
  InlineForm,
  Input,
  Label,
  MonoValue,
  Muted,
  Note,
  Panel,
  PanelTitle,
  ResultCard,
  RowActions,
  StatusBadge,
} from './ui';
import { useRef, useState } from 'react';
import { createApiKey, revokeApiKey } from '../api/client';

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
      setError(
        err.message || 'Could not create the API key. Please try again.',
      );
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
      onChange(
        apiKeys.map((key) =>
          key.id === item.id ? { ...key, is_active: false } : key,
        ),
      );
      setMessage(`${item.name} revoked.`);
    } catch (err) {
      setError(
        err.message || 'Could not revoke the API key. Please try again.',
      );
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
      setError(
        'Could not copy the API key. Select the token and copy it manually.',
      );
    } finally {
      copyRef.current = false;
      setCopying(false);
    }
  }

  return (
    <Panel>
      <div>
        <div>
          <Eyebrow>CLI</Eyebrow>
          <PanelTitle>API keys.</PanelTitle>
        </div>
      </div>

      <InlineForm onSubmit={handleCreate}>
        <Label htmlFor="api-key-name" className="col-span-full">
          API key name
        </Label>
        <Input
          id="api-key-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          disabled={Boolean(pending) || Boolean(createdToken)}
          required
        />
        <Button
          type="submit"
          variant="primary"
          disabled={Boolean(pending) || Boolean(createdToken)}
        >
          {pending === 'creating' ? 'Creating' : 'Create'}
        </Button>
      </InlineForm>

      {error && <Alert role="alert">{error}</Alert>}
      {message && (
        <StatusBadge
          className={`m-0 whitespace-normal`}
          tone="success"
          as="p"
          role="status"
        >
          {message}
        </StatusBadge>
      )}
      {createdToken && (
        <ResultCard as="div">
          <strong role="status">API key created. Copy it now.</strong>
          <Note>
            This token is shown only once. You cannot see it again later.
          </Note>
          <MonoValue>{createdToken}</MonoValue>
          <RowActions align="start">
            <Button
              type="button"
              variant="secondary"
              onClick={copyToken}
              disabled={copying || Boolean(pending)}
            >
              {copying ? 'Copying' : 'Copy'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={copying || Boolean(pending)}
              onClick={() => {
                setCreatedToken('');
                setMessage('');
                setError('');
              }}
            >
              Done
            </Button>
          </RowActions>
        </ResultCard>
      )}

      <DataList>
        {apiKeys.map((item) => (
          <DataRow key={item.id}>
            <div>
              <DataTitle>{item.name}</DataTitle>
              <DataText>
                {item.prefix}... created{' '}
                {new Date(item.created_at).toLocaleDateString()}
              </DataText>
            </div>
            <RowActions>
              <StatusBadge tone={item.is_active ? 'success' : 'neutral'}>
                {item.is_active ? 'Active' : 'Revoked'}
              </StatusBadge>
              {item.is_active && (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => handleRevoke(item)}
                  disabled={Boolean(pending) || copying}
                >
                  {pending === item.id ? 'Revoking' : 'Revoke'}
                </Button>
              )}
            </RowActions>
          </DataRow>
        ))}
        {apiKeys.length === 0 && <Muted>No API keys yet.</Muted>}
      </DataList>
    </Panel>
  );
}
