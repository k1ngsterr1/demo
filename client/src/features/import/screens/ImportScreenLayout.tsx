import { CaretLeftIcon, GearSixIcon } from 'phosphor-react-native';
import React, { type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Brand, DisplayText, IconButton } from '../../../ui/components';
import { color, styles } from '../../../ui/theme';
import { FadeIn } from '../../../ui/motion';
import { useImport } from '../ImportFlowContext';
import { FaultBanner } from '../ImportStates';
import type { ImportStackRoutes } from '../navigation';
import { getUploadTransitionKey } from '../uploadStages';

export function ImportScreenLayout({
  heading = true,
  showFault = true,
  onBack,
  children,
}: {
  heading?: boolean;
  showFault?: boolean;
  onBack?(): void;
  children: ReactNode;
}) {
  const { view, state, picking, reduceMotion } = useImport();
  const transitionKey = getUploadTransitionKey(state.operation, picking, view.fault);
  const navigation = useNavigation<NativeStackNavigationProp<ImportStackRoutes>>();
  return (
    <SafeAreaView
      style={styles.safe}
      edges={['top', 'bottom']}
    >
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          {onBack && (
            <IconButton
              label="Назад к выбору файла"
              onPress={onBack}
              disabled={view.busy}
            >
              <CaretLeftIcon
                size={22}
                color={color.ink}
              />
            </IconButton>
          )}
          <Brand />
          <IconButton
            label="Настройки подключения"
            onPress={() => navigation.navigate('Settings')}
          >
            <GearSixIcon
              size={23}
              color={color.ink}
            />
          </IconButton>
        </View>
        <FadeIn
          transitionKey={transitionKey}
          reduceMotion={reduceMotion}
          style={styles.screenBody}
        >
          {heading && (
            <View style={styles.heading}>
              <DisplayText
                accessibilityRole="header"
                style={styles.title}
              >
                {view.title}
              </DisplayText>
              {view.subtitle && <Text style={styles.subtitle}>{view.subtitle}</Text>}
            </View>
          )}
          {showFault && view.fault && <FaultBanner fault={view.fault} />}
          {children}
        </FadeIn>
      </ScrollView>
    </SafeAreaView>
  );
}
