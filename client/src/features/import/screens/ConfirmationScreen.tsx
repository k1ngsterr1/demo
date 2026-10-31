import React from 'react';
import { useImport } from '../ImportFlowContext';
import { FileConfirmation } from '../ImportStates';
import { ImportScreenLayout } from './ImportScreenLayout';

export function ConfirmationScreen() {
  const { state, view, submit, cancel, reselect } = useImport();
  return (
    <ImportScreenLayout onBack={cancel}>
      {state.operation?.file && (
        <FileConfirmation
          file={state.operation.file}
          busy={view.busy}
          unavailable={view.selectionUnavailable}
          cleanupFailed={view.selectionCleanupFailed}
          onSubmit={submit}
          onCancel={cancel}
          onReselect={() => {
            void reselect();
          }}
        />
      )}
    </ImportScreenLayout>
  );
}
