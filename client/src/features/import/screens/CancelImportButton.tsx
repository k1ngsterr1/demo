import React from 'react';
import { Alert } from 'react-native';
import { Button } from '../../../ui/components';
import { useImport } from '../ImportFlowContext';

export function CancelImportButton() {
  const { state, view, cancelImport } = useImport();
  if (!view.canCancelTransfer) {
    return null;
  }
  const confirm = () => {
    const key = state.operation?.key;
    Alert.alert(
      'Отменить отправку?',
      'Остановим ожидание и удалим временную копию. Сервер мог уже принять файл — проверку и удаление сохраним отдельно.',
      [
        { text: 'Продолжить ожидание', style: 'cancel' },
        { text: 'Отменить отправку', style: 'destructive', onPress: () => cancelImport(key) },
      ],
    );
  };
  return (
    <Button
      title={state.cancelling ? 'Отменяем…' : 'Отменить отправку'}
      onPress={confirm}
      disabled={state.cancelling}
      secondary
    />
  );
}
