import { useOutletContext } from 'react-router-dom';
import { getApiKeys, getBillingStatus } from '../api/client';
import ApiKeyPanel from '../components/ApiKeyPanel';
import BillingPanel from '../components/BillingPanel';
import RequestState from '../components/RequestState';
import { Muted, PageHeader, Panel } from '../components/ui';
import AccountSettings from '../components/AccountSettings';
import useResource from '../hooks/useResource';

export default function AccountPage() {
  const { account } = useOutletContext();
  const user = account.data;
  const keys = useResource(getApiKeys);
  const billing = useResource(
    getBillingStatus,
    account.status === 'ready' && !user.is_admin,
  );
  return (
    <>
      <PageHeader
        title="Your account."
        description="Cloud access and API keys in one place."
      />
      <div className="grid min-w-0 gap-6">
        {account.status === 'ready' &&
          (user.is_admin ? (
            <Panel>
              <Muted>Administrator accounts do not require billing.</Muted>
            </Panel>
          ) : (
            <RequestState resource={billing} label="Billing">
              <BillingPanel
                billing={billing.data}
                onRefresh={billing.refresh}
              />
            </RequestState>
          ))}
        <RequestState resource={keys} label="API keys">
          <ApiKeyPanel
            apiKeys={keys.data?.items || []}
            onChange={(items) => keys.update({ items })}
          />
        </RequestState>
        {account.status === 'ready' && <AccountSettings user={user} />}
      </div>
    </>
  );
}
