import { getDomains } from '../api/client';
import DomainPanel from '../components/DomainPanel';
import RequestState from '../components/RequestState';
import { PageHeader } from '../components/ui';
import useResource from '../hooks/useResource';

export default function DomainsPage() {
  const domains = useResource(getDomains);
  return (
    <>
      <PageHeader
        title="Custom domains."
        description="Manage domains, DNS records and the people who use them."
      />
      <RequestState resource={domains} label="Domains">
        <DomainPanel
          domains={domains.data?.items || []}
          onChange={(items) => domains.update({ items })}
        />
      </RequestState>
    </>
  );
}
