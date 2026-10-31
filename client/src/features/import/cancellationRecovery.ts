import type { ImportControllerPort } from './services';

const CHECK_DELAY_MS = 1_500;
const MAX_CHECKS = 3;

/** Foreground-only recovery. The controller remains the sole owner of durable state. */
export class CancellationRecovery {
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private remaining = MAX_CHECKS;
  private requested = true;
  private knownKeys = new Set<string>();
  private unsubscribe: () => void;

  constructor(private controller: ImportControllerPort) {
    this.unsubscribe = controller.subscribe(this.schedule);
    this.schedule();
  }

  private schedule = (): void => {
    if (this.stopped) {
      return;
    }

    const state = this.controller.snapshot();
    if (state.pendingCancellations.some(entry => !this.knownKeys.has(entry.key))) {
      this.remaining = MAX_CHECKS;
      this.requested = true;
    }
    this.knownKeys = new Set(state.pendingCancellations.map(entry => entry.key));

    const operation = state.operation;
    const home = !operation || (operation.phase === 'deleted' && !operation.file);
    const idle = home && !state.booting && !state.busy && !state.cancelling;
    const failed =
      state.cancellationFault &&
      !['cancel-not-found', 'wait-stopped'].includes(state.cancellationFault);

    if (!idle || !this.knownKeys.size || (!this.requested && failed) || !this.remaining) {
      this.clearTimer();
      return;
    }
    if (this.timer || this.running) {
      return;
    }

    this.timer = setTimeout(() => {
      this.timer = null;
      void this.check();
    }, CHECK_DELAY_MS);
  };

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async check(): Promise<void> {
    this.remaining--;
    this.requested = false;
    const task = this.controller.reconcileCancellations();
    this.running = task;
    try {
      await task;
    } finally {
      this.running = null;
      this.schedule();
    }
  }

  retry(): void {
    this.remaining = MAX_CHECKS;
    this.requested = true;
    this.schedule();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.unsubscribe();
    this.clearTimer();
    if (this.running) {
      await this.controller.interruptCancellationCheck();
    }
    await this.running;
  }
}
