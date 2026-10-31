import React, { useCallback, useState } from 'react';
import { StatusBar, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { ImportNavigator } from '../features/import/ImportNavigator';
import type { ImportServices } from '../features/import/services';
import { color, styles } from '../ui/theme';
import { StartupScreen } from './StartupScreen';
import { importServices } from './services';
import { useAppEnvironment } from './useAppEnvironment';

void SplashScreen.preventAutoHideAsync().catch(() => {
  /* Hot reload may have hidden it already. */
});
const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: color.background,
    card: color.surface,
    text: color.ink,
    primary: color.ink,
    border: color.line,
  },
};

export default function AppRoot({ services = importServices }: { services?: ImportServices }) {
  const [starting, setStarting] = useState(true);
  const finishStartup = useCallback(() => setStarting(false), []);
  const environment = useAppEnvironment();
  return (
    <SafeAreaProvider>
      <View style={styles.safe}>
        <StatusBar
          barStyle="dark-content"
          backgroundColor={color.background}
        />
        <View
          style={styles.flex}
          pointerEvents={starting ? 'none' : 'auto'}
          accessibilityElementsHidden={starting}
          importantForAccessibility={starting ? 'no-hide-descendants' : 'auto'}
        >
          <NavigationContainer theme={navigationTheme}>
            <ImportNavigator
              services={services}
              {...environment}
            />
          </NavigationContainer>
        </View>
        {starting && (
          <StartupScreen
            onFinish={finishStartup}
            {...environment}
          />
        )}
      </View>
    </SafeAreaProvider>
  );
}
