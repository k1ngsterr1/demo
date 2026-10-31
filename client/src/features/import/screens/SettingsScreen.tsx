import React, { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, InfoRow, SheetLayout } from '../../../ui/components';
import { styles } from '../../../ui/theme';
import { useImport } from '../ImportFlowContext';
import type { ImportStackRoutes } from '../navigation';
import { importMessages } from '../presentation';
import { Fault } from '../../../core/model';

export function SettingsScreen({
  navigation,
}: NativeStackScreenProps<ImportStackRoutes, 'Settings'>) {
  const { state, baseUrl, changeBaseUrl, settingsBusy } = useImport();
  const operation = state.operation;
  const [draft, setDraft] = useState(baseUrl);
  const [fault, setFault] = useState<string | null>(null);
  useEffect(() => {
    setDraft(baseUrl);
  }, [baseUrl]);
  async function save() {
    if (settingsBusy) {
      return;
    }
    setFault(null);
    try {
      await changeBaseUrl(draft);
      if (navigation.isFocused()) {
        navigation.goBack();
      }
    } catch (error) {
      setFault(error instanceof Fault ? error.code : 'settings-save');
    }
  }
  return (
    <SheetLayout
      onClose={() => navigation.goBack()}
      closeLabel="Закрыть настройки"
      title="Подключение"
      keyboardAvoiding
    >
      <Text style={styles.subtitle}>
        Приложение работает с локальным сервером и синтетическими выписками.
      </Text>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Адрес сервера</Text>
        <TextInput
          accessibilityLabel="Адрес локального mock"
          value={draft}
          editable={!settingsBusy}
          onChangeText={value => {
            setDraft(value);
            setFault(null);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
          onSubmitEditing={save}
          style={styles.input}
        />
        <Text style={styles.muted}>
          Адрес применяется к следующему импорту. Для iPhone используйте локальный IP компьютера в
          той же сети Wi-Fi.
        </Text>
        {fault && (
          <Text
            accessibilityRole="alert"
            style={[styles.body, styles.dangerText]}
          >
            {importMessages[fault]}
          </Text>
        )}
        <Button
          title="Сохранить адрес"
          onPress={save}
          disabled={settingsBusy}
        />
      </View>
      {operation && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Текущий импорт</Text>
          <Text
            selectable
            style={styles.body}
          >
            {operation.baseUrl}
          </Text>
          <InfoRow
            label="Состояние"
            value={operation.phase}
          />
          {operation.job && (
            <InfoRow
              label="Ответ сервера"
              value={operation.job.status + ' · revision ' + operation.job.revision}
            />
          )}
          <Text style={styles.muted}>Адрес уже начатой операции сохраняется до её завершения.</Text>
        </View>
      )}
    </SheetLayout>
  );
}
