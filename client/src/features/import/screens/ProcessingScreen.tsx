import React from 'react';
import { useIsFocused } from '@react-navigation/native';
import { Button } from '../../../ui/components';
import { useImport } from '../ImportFlowContext';
import { ProgressState } from '../ImportStates';
import { DeleteImportButton } from './DeleteImportButton';
import { ImportScreenLayout } from './ImportScreenLayout';
import { CancelImportButton } from './CancelImportButton';
import { getUploadProgressStage } from '../uploadStages';

export function ProcessingScreen() {
  const { view, state, refresh, submit, stopWaiting, foreground, reduceMotion } = useImport();
  const focused = useIsFocused();
  const stage = getUploadProgressStage(state.operation);
  return (
    <ImportScreenLayout showFault={false}>
      {stage && (
        <ProgressState
          busy={view.busy}
          spinning={view.spinning}
          text={view.progressCopy}
          retryUpload={view.retryUpload}
          onRefresh={refresh}
          onSubmit={submit}
          stage={stage}
          reduceMotion={reduceMotion}
          activityAllowed={foreground && focused}
          fault={view.fault}
        />
      )}
      <CancelImportButton />
      {view.showStopWaiting && (
        <Button
          title="Остановить ожидание"
          onPress={stopWaiting}
          disabled={!state.busy}
          dimWhenDisabled={false}
          secondary
        />
      )}
      <DeleteImportButton />
    </ImportScreenLayout>
  );
}
