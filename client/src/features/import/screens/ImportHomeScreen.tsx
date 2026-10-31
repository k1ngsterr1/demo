import React from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useImport } from '../ImportFlowContext';
import { CancellationErrorNotice, EmptyState } from '../ImportStates';
import { ImportScreenLayout } from './ImportScreenLayout';

export function ImportHomeScreen() {
  const {
    view,
    picking,
    pick,
    settingsReady,
    settingsBusy,
    reconcileCancellations,
    foreground,
    reduceMotion,
  } = useImport();
  const focused = useIsFocused();
  return (
    <ImportScreenLayout heading={false}>
      {view.cancellationIssue && (
        <CancellationErrorNotice
          message={view.cancellationIssue}
          busy={view.busy}
          onRetry={reconcileCancellations}
        />
      )}
      <EmptyState
        busy={view.busy || !view.canPick || !settingsReady || settingsBusy}
        picking={picking}
        reduceMotion={reduceMotion}
        activityAllowed={foreground && focused}
        onPick={() => {
          void pick();
        }}
      />
    </ImportScreenLayout>
  );
}
