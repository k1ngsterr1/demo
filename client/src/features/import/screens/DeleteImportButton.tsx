import { TrashIcon } from 'phosphor-react-native';
import React from 'react';
import { Alert } from 'react-native';
import { Button } from '../../../ui/components';
import { color } from '../../../ui/theme';
import { useImport } from '../ImportFlowContext';

export function DeleteImportButton() {
  const { state, view, deleteImport } = useImport();
  if (!view.canDelete) {
    return null;
  }
  const confirm = () =>
    Alert.alert(
      'Удалить импорт?',
      'Удалим отчёт с сервера и временную копию. Исходный файл в «Файлах» останется у вас.',
      [
        { text: 'Оставить', style: 'cancel' },
        { text: 'Удалить', style: 'destructive', onPress: deleteImport },
      ],
    );
  return (
    <Button
      title={state.operation?.phase === 'delete_failed' ? 'Повторить удаление' : 'Удалить импорт'}
      onPress={confirm}
      disabled={view.busy}
      dimWhenDisabled={false}
      danger
      icon={
        <TrashIcon
          size={20}
          color={color.danger}
        />
      }
    />
  );
}
