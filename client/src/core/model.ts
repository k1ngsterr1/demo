export const MAX_BYTES = 10 * 1024 * 1024;
export type Format = 'pdf' | 'csv';
export type Status = 'queued' | 'processing' | 'ready' | 'error' | 'deleting' | 'deleted';
export type Item = {
  id: string;
  merchant: string;
  amountMinor: number;
  cadence: 'monthly';
  lastSeen: string;
};
export type Job = {
  jobId: string;
  status: Status;
  revision: number;
  currency?: 'AUD';
  items?: Item[];
};
export type LocalFile = { stagedId: string; name: string; size: number; format: Format };
export const isStagedId = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.bin$/i.test(value);
export type Phase = 'selected' | 'uncertain' | 'active' | 'deleting' | 'delete_failed' | 'deleted';
export type Journal = {
  version: 1;
  key: string;
  baseUrl: string;
  phase: Phase;
  file?: LocalFile;
  job?: Job;
  deleteKey?: string;
};

export class Fault extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const string = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const integer = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

export function parseJob(value: unknown): Job {
  if (
    !record(value) ||
    !string(value.jobId) ||
    !integer(value.revision) ||
    value.revision < 1 ||
    !string(value.status) ||
    !['queued', 'processing', 'ready', 'error', 'deleting', 'deleted'].includes(value.status)
  ) {
    throw new Fault('bad-response');
  }
  if (value.status === 'ready') {
    if (value.currency !== 'AUD' || !Array.isArray(value.items)) {
      throw new Fault('bad-response');
    }
    const items = value.items.map((item: unknown): Item => {
      if (
        !record(item) ||
        !string(item.id) ||
        !string(item.merchant) ||
        !integer(item.amountMinor) ||
        item.cadence !== 'monthly' ||
        typeof item.lastSeen !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(item.lastSeen)
      ) {
        throw new Fault('bad-response');
      }
      return {
        id: item.id,
        merchant: item.merchant,
        amountMinor: item.amountMinor,
        cadence: item.cadence,
        lastSeen: item.lastSeen,
      };
    });
    if (
      new Set(items.map(item => item.id)).size !== items.length ||
      !Number.isSafeInteger(items.reduce((sum, item) => sum + item.amountMinor, 0))
    ) {
      throw new Fault('bad-response');
    }
    return {
      jobId: value.jobId,
      status: 'ready',
      revision: value.revision,
      currency: 'AUD',
      items,
    };
  }
  return { jobId: value.jobId, status: value.status as Status, revision: value.revision };
}

export function parseJournal(raw: string): Journal {
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !record(value) ||
      value.version !== 1 ||
      !string(value.key) ||
      value.key.length < 8 ||
      !string(value.baseUrl) ||
      !string(value.phase) ||
      !['selected', 'uncertain', 'active', 'deleting', 'delete_failed', 'deleted'].includes(
        value.phase,
      )
    ) {
      throw new Error();
    }
    validateBaseUrl(value.baseUrl);
    if (
      value.file !== undefined &&
      (!record(value.file) ||
        !isStagedId(value.file.stagedId) ||
        !string(value.file.name) ||
        !integer(value.file.size) ||
        value.file.size < 1 ||
        value.file.size > MAX_BYTES ||
        !string(value.file.format) ||
        !['pdf', 'csv'].includes(value.file.format))
    ) {
      throw new Error();
    }
    const job = value.job === undefined ? undefined : parseJob(value.job);
    if (value.deleteKey !== undefined && (!string(value.deleteKey) || value.deleteKey.length < 8)) {
      throw new Error();
    }
    if (['active', 'deleting', 'delete_failed', 'deleted'].includes(value.phase) && !job) {
      throw new Error();
    }
    if (value.phase === 'selected' && !value.file) {
      throw new Error();
    }
    if (value.phase === 'deleted' && job?.status !== 'deleted') {
      throw new Error();
    }
    return {
      version: 1,
      key: value.key,
      baseUrl: value.baseUrl,
      phase: value.phase as Phase,
      file:
        value.file === undefined
          ? undefined
          : {
              stagedId: (value.file as LocalFile).stagedId,
              name: (value.file as LocalFile).name,
              size: (value.file as LocalFile).size,
              format: (value.file as LocalFile).format,
            },
      job,
      deleteKey: value.deleteKey as string | undefined,
    };
  } catch {
    throw new Fault('storage-corrupt');
  }
}

export function validateBaseUrl(raw: string): string {
  try {
    const url = new URL(raw);
    // This exercise only talks to an explicitly configured local/LAN mock.
    if (
      url.protocol !== 'http:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      throw new Error();
    }
    const host = url.hostname;
    if (
      !(
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '[::1]' ||
        /^10\.\d+\.\d+\.\d+$/.test(host) ||
        /^192\.168\.\d+\.\d+$/.test(host) ||
        /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host)
      )
    ) {
      throw new Error();
    }
    return url.origin;
  } catch {
    throw new Fault('bad-url');
  }
}

export function acceptJob(current: Job | undefined, incoming: Job): Job {
  if (!current) {
    return incoming;
  }
  if (current.jobId !== incoming.jobId) {
    throw new Fault('wrong-job');
  }
  if (current.status === 'deleted' || incoming.revision <= current.revision) {
    return current;
  }
  if (
    current.status === 'deleting' &&
    incoming.status !== 'deleting' &&
    incoming.status !== 'deleted'
  ) {
    return current;
  }
  return incoming;
}

export function money(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}
