import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { color } from '../../ui/theme';
import { ImportFlowProvider, useImport } from './ImportFlowContext';
import { getImportRoute, type ImportFlowRoutes, type ImportStackRoutes } from './navigation';
import type { ImportServices } from './services';
import { useConfirmationBack } from './useConfirmationBack';
import { CleanupScreen } from './screens/CleanupScreen';
import { ConfirmationScreen } from './screens/ConfirmationScreen';
import { DetailsScreen } from './screens/DetailsScreen';
import { ImportHomeScreen } from './screens/ImportHomeScreen';
import { ProcessingScreen } from './screens/ProcessingScreen';
import { ReportScreen } from './screens/ReportScreen';
import { RestoreScreen } from './screens/RestoreScreen';
import { SettingsScreen } from './screens/SettingsScreen';

const Flow = createNativeStackNavigator<ImportFlowRoutes>();
const Root = createNativeStackNavigator<ImportStackRoutes>();
const screens = {
  Restore: RestoreScreen,
  ImportHome: ImportHomeScreen,
  Confirmation: ConfirmationScreen,
  Processing: ProcessingScreen,
  Report: ReportScreen,
  Cleanup: CleanupScreen,
};

function ImportFlowStack() {
  const flow = useImport();
  const { state, reduceMotion } = flow;
  useConfirmationBack(flow);
  const route = getImportRoute(state);
  // Completed steps leave history. Back cannot expose a stale confirmation or replay POST.
  return (
    <Flow.Navigator
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        // Native screen transitions retain no completed steps in navigation history.
        animation: reduceMotion ? 'none' : 'fade',
        animationDuration: 320,
        contentStyle: { backgroundColor: color.background },
      }}
    >
      <Flow.Screen
        name={route}
        component={screens[route]}
        navigationKey={state.operation?.key ?? 'empty'}
      />
    </Flow.Navigator>
  );
}

function ImportStack() {
  const { view, reduceMotion } = useImport();
  return (
    <Root.Navigator
      screenOptions={{
        headerShown: false,
        animation: reduceMotion ? 'none' : 'default',
        contentStyle: { backgroundColor: color.background },
      }}
    >
      <Root.Screen
        name="ImportFlow"
        component={ImportFlowStack}
      />
      <Root.Group screenOptions={{ presentation: 'modal' }}>
        <Root.Screen
          name="Settings"
          component={SettingsScreen}
        />
        {view.ready && (
          <Root.Screen
            name="Details"
            component={DetailsScreen}
          />
        )}
      </Root.Group>
    </Root.Navigator>
  );
}

export function ImportNavigator({
  services,
  foreground,
  reduceMotion,
}: {
  services: ImportServices;
  foreground: boolean;
  reduceMotion: boolean;
}) {
  return (
    <ImportFlowProvider
      services={services}
      foreground={foreground}
      reduceMotion={reduceMotion}
    >
      <ImportStack />
    </ImportFlowProvider>
  );
}
