import { acceptJob, Fault, type Job, type Journal, type LocalFile, validateBaseUrl } from './model';
import { HttpFault, type Api } from './api';
import {
  cancellationJob,
  MAX_PENDING_CANCELLATIONS,
  type PendingCancellation,
  type PendingCancellationStore,
} from './cancellations';

export interface Store {
  load(): Promise<Journal | null>;
  save(journal: Journal | null): Promise<void>;
}
export interface Files {
  remove(file: LocalFile): Promise<void>;
  sweep(keepId?: string): Promise<void>;
  verify(file: LocalFile): Promise<void>;
}
export type Snapshot = {
  operation: Journal | null;
  busy: boolean;
  booting: boolean;
  fault: string | null;
  pendingCancellations: PendingCancellation[];
  cancelling: boolean;
  checkingCancellations: boolean;
  cancellationFault: string | null;
};

/** One serialized owner of the journal; never perform network mutations before durable intent. */
export class ImportController {
  private state: Snapshot = {
    operation: null,
    busy: false,
    booting: true,
    fault: null,
    pendingCancellations: [],
    cancelling: false,
    checkingCancellations: false,
    cancellationFault: null,
  };
  private listeners = new Set<() => void>();
  private disposed = false;
  private readyCheck = false;
  private activeAbort: AbortController | null = null;
  private activeRun: Promise<void> | null = null;

  constructor(
    private store: Store,
    private files: Files,
    private api: Api,
    private randomKey: () => string,
    private cancellations: PendingCancellationStore,
  ) {}

  snapshot = (): Snapshot => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
    this.activeAbort?.abort();
  }

  private emit(next: Partial<Snapshot>): void {
    if (this.disposed) {
      return;
    }
    this.state = { ...this.state, ...next };
    this.listeners.forEach(listener => listener());
  }

  private async persist(operation: Journal | null): Promise<void> {
    if (this.disposed) {
      throw new Fault('disposed');
    }
    await this.store.save(operation);
    if (this.disposed) {
      throw new Fault('disposed');
    }
    this.emit({ operation });
  }

  private async run(
    action: () => Promise<void>,
    kind: 'normal' | 'cancel' | 'reconcile' = 'normal',
  ): Promise<void> {
    if (this.state.busy || this.disposed || (this.state.cancelling && kind !== 'cancel')) {
      return;
    }
    const abort = new AbortController();
    const task = Promise.resolve().then(async () => {
      try {
        if (!this.disposed) {
          await action();
        }
      } catch (error) {
        const code = error instanceof Fault ? error.code : 'storage';
        this.emit(kind === 'reconcile' ? { cancellationFault: code } : { fault: code });
      } finally {
        this.emit({ busy: false, checkingCancellations: false });
      }
    });
    this.activeRun = task;
    this.activeAbort = abort;
    this.emit(
      kind === 'reconcile'
        ? { busy: true, checkingCancellations: true, cancellationFault: null }
        : { busy: true, fault: null },
    );
    await task;
    if (this.activeRun === task) {
      this.activeRun = null;
      this.activeAbort = null;
    }
  }

  private async persistCancellations(entries: PendingCancellation[]): Promise<void> {
    if (this.disposed) {
      throw new Fault('disposed');
    }
    await this.cancellations.save(entries);
    if (this.disposed) {
      throw new Fault('disposed');
    }
    this.emit({ pendingCancellations: entries });
  }

  private async finishLocalCancellation(): Promise<void> {
    const op = this.state.operation;
    if (!op || !this.state.pendingCancellations.some(entry => entry.key === op.key)) {
      return;
    }
    try {
      if (op.file) {
        await this.files.remove(op.file);
      }
    } catch {
      throw new Fault('cleanup');
    }
    await this.persist(null);
  }

  private isCancelled(op: Journal): boolean {
    return this.state.pendingCancellations.some(entry => entry.key === op.key);
  }

  async boot(): Promise<void> {
    await this.run(async () => {
      const [operation, pendingCancellations] = await Promise.all([
        this.store.load(),
        this.cancellations.load(),
      ]);
      if (this.disposed) {
        return;
      }
      this.emit({ operation, pendingCancellations });
      // A crash after archiving intent must never restore the old Submit button.
      await this.finishLocalCancellation();
      if (this.disposed) {
        return;
      }
      await this.files.sweep(this.state.operation?.file?.stagedId);
      if (this.disposed) {
        return;
      }
      await this.cleanup();
      if (this.disposed) {
        return;
      }
      this.emit({ booting: false });
      const current = this.state.operation;
      if (current?.phase === 'selected' && current.file) {
        await this.files.verify(current.file);
      } else if (current && current.phase !== 'deleted') {
        await this.refreshInternal();
      }
    });
  }

  async select(file: LocalFile, baseUrl: string): Promise<void> {
    await this.run(async () => {
      const old = this.state.operation;
      if (this.state.booting || (old && (old.phase !== 'deleted' || old.file))) {
        throw new Fault('operation-active');
      }
      if (this.state.pendingCancellations.length >= MAX_PENDING_CANCELLATIONS) {
        throw new Fault('cancellation-queue-full');
      }
      await this.files.verify(file);
      await this.persist({
        version: 1,
        key: this.randomKey(),
        baseUrl: validateBaseUrl(baseUrl),
        phase: 'selected',
        file,
      });
    });
  }

  async cancelSelection(): Promise<void> {
    await this.run(async () => {
      const op = this.state.operation;
      if (!op || op.phase !== 'selected') {
        return;
      }
      if (op.file) {
        await this.files.remove(op.file);
      }
      await this.persist(null);
    });
  }

  async submit(): Promise<void> {
    await this.run(async () => {
      let op = this.state.operation;
      if (!op || !['selected', 'uncertain'].includes(op.phase)) {
        return;
      }
      if (this.isCancelled(op)) {
        throw new Fault('operation-cancelled');
      }
      if (op.phase === 'uncertain') {
        const found = await this.api.lookup(op, this.activeAbort?.signal);
        if (found) {
          await this.apply(found);
          return;
        }
      }
      if (!op.file) {
        throw new Fault('file-missing');
      }
      await this.files.verify(op.file);
      // A crash after this write is an uncertain create. Relaunch only performs GET.
      op = { ...op, phase: 'uncertain' };
      await this.persist(op);
      await this.apply(await this.api.create(op, this.activeAbort?.signal));
    });
  }

  private async apply(incoming: Job): Promise<void> {
    if (this.disposed) {
      return;
    }
    const op = this.state.operation;
    if (!op || op.phase === 'deleted') {
      return;
    }
    const job = acceptJob(op.job, incoming);
    if (job.status === 'ready' && op.job?.status !== 'ready') {
      this.readyCheck = true;
    }
    let phase: Journal['phase'] = 'active';
    if (job.status === 'deleted') {
      phase = 'deleted';
    } else if (job.status === 'deleting') {
      phase = 'deleting';
    } else if (op.deleteKey) {
      phase = 'delete_failed';
    }
    await this.persist({ ...op, job, phase });
    await this.cleanup();
  }

  private async cleanup(): Promise<void> {
    const op = this.state.operation;
    if (!op?.file || (!op.job && op.phase !== 'deleted')) {
      return;
    }
    // Once a jobId is durable, replaying file bytes is unnecessary.
    try {
      await this.files.remove(op.file);
    } catch {
      throw new Fault('cleanup');
    }
    await this.persist({ ...op, file: undefined });
  }

  private async refreshInternal(): Promise<void> {
    const op = this.state.operation;
    if (!op || op.phase === 'selected') {
      return;
    }
    if (this.isCancelled(op)) {
      await this.finishLocalCancellation();
      return;
    }
    if (op.phase === 'deleted') {
      await this.cleanup();
      return;
    }
    const checkingReady = op.job?.status === 'ready';
    const job = op.job
      ? await this.api.get(op, this.activeAbort?.signal)
      : await this.api.lookup(op, this.activeAbort?.signal);
    if (!job) {
      throw new Fault('not-found-yet');
    }
    await this.apply(job);
    if (checkingReady) {
      this.readyCheck = false;
    }
  }

  async refresh(): Promise<void> {
    await this.run(() => this.refreshInternal());
  }

  get shouldPoll(): boolean {
    const op = this.state.operation;
    if (
      this.state.booting ||
      this.state.cancelling ||
      this.state.fault ||
      !op ||
      this.isCancelled(op)
    ) {
      return false;
    }
    if (op.phase === 'uncertain' || op.phase === 'deleting') {
      return true;
    }
    return (
      op.phase === 'active' &&
      (op.job?.status === 'queued' || op.job?.status === 'processing' || this.readyCheck)
    );
  }

  async deleteImport(): Promise<void> {
    await this.run(async () => {
      const op = this.state.operation;
      if (!op?.job || op.phase === 'deleted' || op.phase === 'selected' || this.isCancelled(op)) {
        return;
      }
      const intent: Journal = {
        ...op,
        deleteKey: op.deleteKey ?? this.randomKey(),
        phase: 'deleting',
      };
      await this.persist(intent);
      try {
        const response = await this.api.delete(intent, this.activeAbort?.signal);
        // Even an unusually fast DELETE response is not proof: only GET confirms deleted.
        if (response.status === 'deleted') {
          await this.refreshInternal();
          return;
        }
        await this.apply(response);
      } catch (error) {
        await this.persist({ ...this.state.operation!, phase: 'delete_failed' });
        throw error;
      }
    });
  }

  stopWaiting(): void {
    if (!this.state.cancelling) {
      this.activeAbort?.abort();
    }
  }

  async interruptCancellationCheck(): Promise<void> {
    if (!this.state.checkingCancellations) {
      return;
    }
    const running = this.activeRun;
    this.activeAbort?.abort();
    await running;
  }

  async cancelImport(expectedKey = this.state.operation?.key): Promise<void> {
    if (
      this.disposed ||
      this.state.cancelling ||
      !expectedKey ||
      this.state.operation?.key !== expectedKey
    ) {
      return;
    }
    this.emit({ cancelling: true, cancellationFault: null });
    const running = this.activeRun;
    this.activeAbort?.abort();
    try {
      await running;
      await this.run(async () => {
        const op = this.state.operation;
        if (!op || op.key !== expectedKey) {
          return;
        }
        if (op.phase === 'selected') {
          try {
            if (op.file) {
              await this.files.remove(op.file);
            }
          } catch {
            throw new Fault('cleanup');
          }
          await this.persist(null);
          return;
        }
        if (op.phase === 'deleted') {
          await this.cleanup();
          return;
        }
        const existing = this.state.pendingCancellations.find(entry => entry.key === op.key);
        if (!existing && this.state.pendingCancellations.length >= MAX_PENDING_CANCELLATIONS) {
          throw new Fault('cancellation-queue-full');
        }
        const job = op.job ? cancellationJob(op.job) : existing?.job;
        const entry: PendingCancellation = {
          key: op.key,
          baseUrl: op.baseUrl,
          deleteKey: existing?.deleteKey ?? op.deleteKey ?? this.randomKey(),
          ...(job ? { job } : {}),
        };
        // Archive intent before either removing bytes or clearing the current journal.
        await this.persistCancellations([
          ...this.state.pendingCancellations.filter(value => value.key !== op.key),
          entry,
        ]);
        await this.finishLocalCancellation();
      }, 'cancel');
    } finally {
      this.emit({ cancelling: false });
    }
  }

  private async reconcileCancellation(entry: PendingCancellation): Promise<void> {
    const operation = (): Journal => ({
      version: 1,
      key: entry.key,
      baseUrl: entry.baseUrl,
      phase: 'uncertain',
      job: entry.job,
      deleteKey: entry.deleteKey,
    });
    const found = entry.job
      ? await this.api.get(operation(), this.activeAbort?.signal)
      : await this.api.lookup(operation(), this.activeAbort?.signal);
    if (!found) {
      throw new Fault('cancel-not-found');
    }
    const accepted = acceptJob(entry.job, found);
    if (found.status === 'deleted' && accepted.status === 'deleted') {
      await this.persistCancellations(
        this.state.pendingCancellations.filter(value => value.key !== entry.key),
      );
      return;
    }
    entry = { ...entry, job: cancellationJob(accepted) };
    await this.persistCancellations(
      this.state.pendingCancellations.map(value => (value.key === entry.key ? entry : value)),
    );
    if (accepted.status === 'deleting') {
      return;
    }
    const response = await this.api.delete(operation(), this.activeAbort?.signal);
    const deletion = acceptJob(entry.job, response);
    if (deletion.status !== 'deleted') {
      entry = { ...entry, job: cancellationJob(deletion) };
      await this.persistCancellations(
        this.state.pendingCancellations.map(value => (value.key === entry.key ? entry : value)),
      );
    }
    // Even DELETE -> deleted cannot remove the recovery record without GET.
    const confirmed = await this.api.get(operation(), this.activeAbort?.signal);
    const latest = acceptJob(entry.job, confirmed);
    if (confirmed.status === 'deleted' && latest.status === 'deleted') {
      await this.persistCancellations(
        this.state.pendingCancellations.filter(value => value.key !== entry.key),
      );
    } else {
      entry = { ...entry, job: cancellationJob(latest) };
      await this.persistCancellations(
        this.state.pendingCancellations.map(value => (value.key === entry.key ? entry : value)),
      );
    }
  }

  async reconcileCancellations(): Promise<void> {
    await this.run(async () => {
      // Never release an archived key while its local cancellation is incomplete.
      await this.finishLocalCancellation();
      for (const entry of [...this.state.pendingCancellations]) {
        if (this.disposed) {
          return;
        }
        if (this.activeAbort?.signal.aborted) {
          throw new Fault('wait-stopped');
        }
        try {
          await this.reconcileCancellation(entry);
        } catch (error) {
          if (this.disposed || this.activeAbort?.signal.aborted) {
            throw new Fault('wait-stopped');
          }
          // Only server failures are isolated; storage and unknown failures stop the pass.
          if (
            !(error instanceof HttpFault) &&
            !(
              error instanceof Fault &&
              ['network', 'timeout', 'bad-response', 'wrong-job', 'cancel-not-found'].includes(
                error.code,
              )
            )
          ) {
            throw error;
          }
          const previous = this.state.cancellationFault;
          this.emit({
            cancellationFault: previous && previous !== 'cancel-not-found' ? previous : error.code,
          });
        }
      }
    }, 'reconcile');
  }
}
