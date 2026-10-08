import { Outlet } from 'react-router-dom';
import { me } from '../api/client';
import Layout from '../components/Layout';
import RequestState from '../components/RequestState';
import VerifyEmailNotice from '../components/VerifyEmailNotice';
import useResource from '../hooks/useResource';

export default function Dashboard() {
  const account = useResource(me);
  const user = account.data;
  return (
    <Layout>
      <RequestState resource={account} label="Account">
        {user && !user.is_verified && (
          <VerifyEmailNotice
            email={user.email}
            canUseFeatures={user.can_use_features}
          />
        )}
      </RequestState>
      <Outlet context={{ account }} />
    </Layout>
  );
}
