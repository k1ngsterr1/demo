import { Fault, validateBaseUrl } from '../core/model';

const SERVER_URL_KEY = 'synthetic-import-server-url-v1';
interface SettingsStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

/** App preference, independent of the current import and cancellation journals. */
export function createServerSettings(storage: SettingsStorage) {
  return {
    async load(): Promise<string | null> {
      try {
        const raw = await storage.getItem(SERVER_URL_KEY);
        return raw === null ? null : validateBaseUrl(raw);
      } catch {
        throw new Fault('settings-load');
      }
    },
    async save(raw: string): Promise<string> {
      const baseUrl = validateBaseUrl(raw.trim());
      try {
        await storage.setItem(SERVER_URL_KEY, baseUrl);
      } catch {
        throw new Fault('settings-save');
      }
      return baseUrl;
    },
  };
}
