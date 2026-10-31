import React from 'react';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useImport } from '../ImportFlowContext';
import { ImportReport } from '../ImportStates';
import type { ImportStackRoutes } from '../navigation';
import { DeleteImportButton } from './DeleteImportButton';
import { ImportScreenLayout } from './ImportScreenLayout';

export function ReportScreen() {
  const { state, view, refresh, reduceMotion, foreground } = useImport();
  const focused = useIsFocused();
  const navigation = useNavigation<NativeStackNavigationProp<ImportStackRoutes>>();
  return (
    <ImportScreenLayout>
      {state.operation?.job && (
        <ImportReport
          job={state.operation.job}
          busy={view.busy}
          reduceMotion={reduceMotion}
          activityAllowed={foreground && focused}
          onRefresh={refresh}
          onDetails={item => navigation.navigate('Details', { itemId: item.id })}
        />
      )}
      <DeleteImportButton />
    </ImportScreenLayout>
  );
}
