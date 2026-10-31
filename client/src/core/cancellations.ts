import { Fault, validateBaseUrl, type Job } from './model';

export const MAX_PENDING_CANCELLATIONS = 32;
export type CancellationJob = Pick<Job, 'jobId' | 'status' | 'revision'>;
export type PendingCancellation = {
  key: string;
  baseUrl: string;
  deleteKey: string;
  job?: CancellationJob;
};
export interface PendingCancellationStore {
  load(): Promise<PendingCancellation[]>;
  save(entries: PendingCancellation[]): Promise<void>;
}
export const cancellationJob = ({ jobId, status, revision }: Job): CancellationJob => ({
  jobId,
  status,
  revision,
});

/** Only recovery metadata survives local cancellation: no filename, URI or report items. */
export function parsePendingCancellations(raw: string): PendingCancellation[] {
  try {
    const value = JSON.parse(raw);
    if (
      value?.version !== 1 ||
      !Array.isArray(value.entries) ||
      value.entries.length > MAX_PENDING_CANCELLATIONS
    ) {
      throw new Error();
    }
    const keys = new Set<string>();
    return value.entries.map((entry: unknown) => {
      if (!entry || typeof entry !== 'object') {
        throw new Error();
      }
      const { key, baseUrl, deleteKey, job } = entry as PendingCancellation;
      if (
        typeof key !== 'string' ||
        key.length < 8 ||
        key.length > 128 ||
        keys.has(key) ||
        typeof baseUrl !== 'string' ||
        typeof deleteKey !== 'string' ||
        deleteKey.length < 8 ||
        deleteKey.length > 128
      ) {
        throw new Error();
      }
      validateBaseUrl(baseUrl);
      keys.add(key);
      if (
        job !== undefined &&
        (!job ||
          typeof job.jobId !== 'string' ||
          !job.jobId ||
          !Number.isSafeInteger(job.revision) ||
          job.revision < 1 ||
          !['queued', 'processing', 'ready', 'error', 'deleting', 'deleted'].includes(job.status))
      ) {
        throw new Error();
      }
      return { key, baseUrl, deleteKey, ...(job ? { job: cancellationJob(job) } : {}) };
    });
  } catch {
    throw new Fault('storage-corrupt');
  }
}
