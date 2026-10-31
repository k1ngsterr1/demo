import type { Snapshot } from '../../core/controller';

export type ImportFlowRoutes = {
  Restore: undefined;
  ImportHome: undefined;
  Confirmation: undefined;
  Processing: undefined;
  Report: undefined;
  Cleanup: undefined;
};

export type ImportStackRoutes = {
  ImportFlow: undefined;
  Settings: undefined;
  Details: { itemId: string };
};

/** Navigation is a projection of the journal, never a second workflow store. */
export function getImportRoute({
  booting,
  operation,
  pendingCancellations,
}: Snapshot): keyof ImportFlowRoutes {
  if (booting) {
    return 'Restore';
  }
  if (!operation) {
    return 'ImportHome';
  }
  if (pendingCancellations.some(entry => entry.key === operation.key)) {
    return 'Cleanup';
  }
  if (operation.phase === 'deleted') {
    return operation.file ? 'Cleanup' : 'ImportHome';
  }
  if (operation.phase === 'selected') {
    return 'Confirmation';
  }
  if (operation.phase === 'active' && operation.job?.status === 'ready') {
    return 'Report';
  }
  return 'Processing';
}
