import React from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { money } from '../../../core/model';
import { DisplayText, InfoRow, SheetLayout } from '../../../ui/components';
import { styles } from '../../../ui/theme';
import { useImport } from '../ImportFlowContext';
import type { ImportStackRoutes } from '../navigation';
import { formatDate } from '../presentation';

export function DetailsScreen({
  navigation,
  route,
}: NativeStackScreenProps<ImportStackRoutes, 'Details'>) {
  const { state } = useImport();
  const item = state.operation?.job?.items?.find(value => value.id === route.params.itemId);
  if (!item) {
    return (
      <SheetLayout
        onClose={() => navigation.goBack()}
        closeLabel="Закрыть подробности"
        title="Списание недоступно"
      >
        <Text style={styles.body}>Не удалось найти списание в текущем отчёте.</Text>
      </SheetLayout>
    );
  }
  return (
    <SheetLayout
      onClose={() => navigation.goBack()}
      closeLabel="Закрыть подробности"
      title={item.merchant}
      eyebrow="Регулярное списание"
    >
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Сумма платежа</Text>
        <DisplayText style={styles.detailAmount}>
          {money(item.amountMinor)}
          <Text style={styles.totalUnit}> AUD</Text>
        </DisplayText>
      </View>
      <View style={styles.card}>
        <InfoRow
          label="Периодичность"
          value="Ежемесячно"
        />
        <View style={styles.divider} />
        <InfoRow
          label="Последнее списание"
          value={formatDate(item.lastSeen)}
        />
      </View>
    </SheetLayout>
  );
}
