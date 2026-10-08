import { useCallback, useEffect, useRef, useState } from 'react';

// Each request owns its status; one failed service must not erase another's data.
export default function useResource(loader, enabled = true) {
  const [resource, setResource] = useState({
    status: 'loading',
    data: null,
    error: '',
  });
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    setResource((current) => ({ ...current, status: 'loading', error: '' }));
    try {
      const data = await loader();
      if (request === sequence.current)
        setResource({ status: 'ready', data, error: '' });
      return data;
    } catch (err) {
      if (request === sequence.current) {
        setResource({
          status: 'error',
          data: null,
          error: err.message || 'Please try again.',
        });
      }
      throw err;
    }
  }, [loader]);
  useEffect(() => {
    let cancelled = false;
    if (enabled)
      Promise.resolve().then(() => {
        if (!cancelled) refresh().catch(() => {});
      });
    return () => {
      cancelled = true;
      sequence.current += 1;
    };
  }, [enabled, refresh]);
  function update(data) {
    setResource({ status: 'ready', data, error: '' });
  }
  return { ...resource, refresh, update };
}
