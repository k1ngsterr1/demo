import { useCallback, useEffect, useRef, useState } from 'react';
import { Fault } from '../../core/model';
import type { ImportServices } from './services';

export function useServerSettings(services: ImportServices) {
  const [baseUrl, setBaseUrl] = useState(services.initialBaseUrl);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fault, setFault] = useState<string | null>(null);
  const saveBusy = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setReady(false);
    setFault(null);
    void services.serverSettings
      .load()
      .then(saved => {
        if (active) {
          setBaseUrl(saved ?? services.initialBaseUrl);
          setReady(true);
        }
      })
      .catch(() => {
        // A read failure must not silently route a new import to the default server.
        if (active) {
          setFault('settings-load');
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [services]);

  const save = useCallback(
    async (raw: string): Promise<void> => {
      if (loading || saveBusy.current) {
        throw new Fault('settings-busy');
      }
      saveBusy.current = true;
      setSaving(true);
      try {
        const saved = await services.serverSettings.save(raw);
        // Publish the new address only after durable storage succeeds.
        setBaseUrl(saved);
        setReady(true);
        setFault(null);
      } finally {
        saveBusy.current = false;
        setSaving(false);
      }
    },
    [loading, services],
  );

  return { baseUrl, ready, busy: loading || saving, fault, save };
}
