import { Alert, Button, Muted, Panel } from './ui';

export default function RequestState({ resource, label, children }) {
  if (resource.status === 'ready') return children;
  return (
    <Panel
      as="div"
      aria-label={label}
      aria-busy={resource.status === 'loading'}
    >
      {resource.status === 'loading' ? (
        <Muted role="status">Loading {label.toLowerCase()}…</Muted>
      ) : (
        <Alert role="alert">
          <p>
            Could not load {label.toLowerCase()}: {resource.error}
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => resource.refresh().catch(() => {})}
          >
            Retry
          </Button>
        </Alert>
      )}
    </Panel>
  );
}
