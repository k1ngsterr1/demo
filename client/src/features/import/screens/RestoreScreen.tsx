import React from 'react';
import { useImport } from '../ImportFlowContext';
import { BootState } from '../ImportStates';
import { ImportScreenLayout } from './ImportScreenLayout';

export function RestoreScreen() {
  const { state, view, recover, foreground, reduceMotion } = useImport();
  return (
    <ImportScreenLayout showFault={false}>
      <BootState
        busy={state.busy}
        fault={view.fault}
        onRecover={recover}
        reduceMotion={reduceMotion}
        activityAllowed={foreground}
      />
    </ImportScreenLayout>
  );
}
