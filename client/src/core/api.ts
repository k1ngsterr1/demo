import { Fault, parseJob, type Job, type Journal, type LocalFile } from './model';

export class HttpFault extends Fault {
  constructor(public readonly status: number) {
    super(`http-${status}`);
  }
}
export interface Api {
  create(operation: Journal, signal?: AbortSignal): Promise<Job>;
  lookup(operation: Journal, signal?: AbortSignal): Promise<Job | null>;
  get(operation: Journal, signal?: AbortSignal): Promise<Job>;
  delete(operation: Journal, signal?: AbortSignal): Promise<Job>;
}
export type Transport = (
  url: string,
  options: {
    method: string;
    headers: Record<string, string>;
    body?: unknown;
    signal: AbortSignal;
    redirect: 'error';
  },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export class HttpApi implements Api {
  constructor(
    private transport: Transport,
    private body: (file: LocalFile) => Promise<unknown>,
    private timeoutMs = 12_000,
  ) {}
  private async request(
    op: Journal,
    method: string,
    path: string,
    extra: { body?: () => Promise<unknown>; headers?: Record<string, string> } = {},
    signal?: AbortSignal,
  ): Promise<Job> {
    const abort = new AbortController();
    let stopCode = 'timeout';
    let onStop: () => void = () => {};
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        // Settle our caller even when native cancellation never settles fetch/body.
        reject(new Fault('timeout'));
        abort.abort();
      }, this.timeoutMs);
    });
    const stopped = new Promise<never>((_, reject) => {
      onStop = () => {
        stopCode = 'wait-stopped';
        reject(new Fault(stopCode));
        abort.abort();
      };
      if (signal?.aborted) {
        onStop();
      } else {
        signal?.addEventListener('abort', onStop, { once: true });
      }
    });
    try {
      return await Promise.race([
        (async () => {
          const body = await extra.body?.();
          // A body resolver that finishes after the deadline must not start a late POST.
          if (abort.signal.aborted) {
            throw new Fault(stopCode);
          }
          const response = await this.transport(op.baseUrl + path, {
            method,
            headers: { Accept: 'application/json', ...extra.headers },
            body,
            signal: abort.signal,
            redirect: 'error',
          });
          if (!response.ok) {
            throw new HttpFault(response.status);
          }
          return parseJob(await response.json());
        })(),
        deadline,
        stopped,
      ]);
    } catch (error) {
      if (error instanceof Fault) {
        throw error;
      }
      throw new Fault('network');
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onStop);
    }
  }
  async create(op: Journal, signal?: AbortSignal): Promise<Job> {
    const file = op.file;
    if (!file) {
      throw new Fault('file-missing');
    }
    return this.request(
      op,
      'POST',
      '/imports',
      {
        body: () => this.body(file),
        headers: {
          'Content-Type': 'application/octet-stream',
          'Idempotency-Key': op.key,
          'X-File-Name': encodeURIComponent(file.name).slice(0, 240),
        },
      },
      signal,
    );
  }
  async lookup(op: Journal, signal?: AbortSignal): Promise<Job | null> {
    try {
      return await this.request(
        op,
        'GET',
        `/imports/by-key/${encodeURIComponent(op.key)}`,
        {},
        signal,
      );
    } catch (error) {
      if (error instanceof HttpFault && error.status === 404) {
        return null;
      }
      throw error;
    }
  }
  get(op: Journal, signal?: AbortSignal): Promise<Job> {
    if (!op.job) {
      throw new Fault('wrong-job');
    }
    return this.request(op, 'GET', `/imports/${encodeURIComponent(op.job.jobId)}`, {}, signal);
  }
  delete(op: Journal, signal?: AbortSignal): Promise<Job> {
    if (!op.job || !op.deleteKey) {
      throw new Fault('wrong-job');
    }
    return this.request(
      op,
      'DELETE',
      `/imports/${encodeURIComponent(op.job.jobId)}`,
      { headers: { 'Idempotency-Key': op.deleteKey } },
      signal,
    );
  }
}
