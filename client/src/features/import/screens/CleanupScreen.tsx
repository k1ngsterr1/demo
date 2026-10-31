import React from 'react';
import { useImport } from '../ImportFlowContext';
import { CancellationCleanupState, CleanupState } from '../ImportStates';
import { ImportScreenLayout } from './ImportScreenLayout';

export function CleanupScreen() {
  const { view, refresh, cancelImport, foreground, reduceMotion } = useImport();
  return (
    <ImportScreenLayout>
      {view.cancellationCleanup ? (
        <CancellationCleanupState
          busy={view.busy}
          onRetry={() => cancelImport()}
          reduceMotion={reduceMotion}
          activityAllowed={foreground}
        />
      ) : (
        <CleanupState
          busy={view.busy}
          onRefresh={refresh}
          reduceMotion={reduceMotion}
          activityAllowed={foreground}
        />
      )}
    </ImportScreenLayout>
  );
}
