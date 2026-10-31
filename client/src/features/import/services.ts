import type { ImportController } from '../../core/controller';
import type { LocalFile } from '../../core/model';

export type ImportControllerPort = Pick<
  ImportController,
  | 'snapshot'
  | 'subscribe'
  | 'boot'
  | 'dispose'
  | 'select'
  | 'submit'
  | 'cancelSelection'
  | 'cancelImport'
  | 'stopWaiting'
  | 'interruptCancellationCheck'
  | 'reconcileCancellations'
  | 'refresh'
  | 'deleteImport'
  | 'shouldPoll'
>;

/** Supplied by the app composition root; the feature never imports native adapters. */
export interface ImportServices {
  createController(): ImportControllerPort;
  pickFile(): Promise<LocalFile | null>;
  removeFile(file: LocalFile): Promise<void>;
  initialBaseUrl: string;
  serverSettings: {
    load(): Promise<string | null>;
    save(raw: string): Promise<string>;
  };
}
