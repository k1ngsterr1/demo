import {
  ArrowClockwiseIcon,
  ArrowUpRightIcon,
  CaretRightIcon,
  CheckCircleIcon,
  ReceiptIcon,
  WarningCircleIcon,
} from 'phosphor-react-native';
import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { money, type Item, type Job, type LocalFile } from '../../core/model';
import { Button, DisplayText, IconButton, IconTile, InfoRow } from '../../ui/components';
import { color, styles } from '../../ui/theme';
import { ImportIllustration } from './ImportIllustration';
import { importMessages } from './presentation';
import { UploadSteps } from './UploadSteps';
import type { UploadProgressStage } from './uploadStages';

function faultCopy(fault: string) {
  return (
    importMessages[fault] ||
    'Операция остановлена. Проверьте подключение и повторите проверку статуса.'
  );
}

export function FaultBanner({ fault }: { fault: string }) {
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={styles.error}
    >
      <View style={styles.errorHeading}>
        <WarningCircleIcon
          size={22}
          color={color.danger}
        />
        <Text style={styles.errorTitle}>Нужно внимание</Text>
      </View>
      <Text style={styles.body}>{faultCopy(fault)}</Text>
    </View>
  );
}

export function BootState({
  busy,
  fault,
  onRecover,
  reduceMotion,
  activityAllowed,
}: {
  busy: boolean;
  fault: string | null;
  onRecover(): void;
  reduceMotion: boolean;
  activityAllowed: boolean;
}) {
  return (
    <View
      style={[styles.card, styles.progressCard]}
      accessibilityLiveRegion="polite"
    >
      <ImportIllustration
        stage={fault ? 'error' : 'checking'}
        active={activityAllowed && (busy || !!fault)}
        reduceMotion={reduceMotion}
      />
      {fault && (
        <Text
          accessibilityRole="alert"
          style={[styles.errorTitle, styles.centeredText]}
        >
          Нужно внимание
        </Text>
      )}
      <Text style={styles.stateDescription}>
        {fault ? faultCopy(fault) : 'Восстанавливаем сохранённую операцию…'}
      </Text>
      {fault && (
        <Button
          title="Повторить восстановление"
          onPress={onRecover}
          disabled={busy}
        />
      )}
    </View>
  );
}

export function EmptyState({
  busy,
  picking,
  onPick,
  reduceMotion,
  activityAllowed,
}: {
  busy: boolean;
  picking: boolean;
  onPick(): void;
  reduceMotion: boolean;
  activityAllowed: boolean;
}) {
  return (
    <>
      <View style={styles.emptyState}>
        <ImportIllustration
          stage={picking ? 'checking' : 'idle'}
          active={activityAllowed}
          reduceMotion={reduceMotion}
        />
        <DisplayText
          accessibilityRole="header"
          accessibilityLabel={picking ? 'Проверяем файл' : 'Добавьте выписку'}
          style={styles.emptyTitle}
        >
          {picking ? 'Проверяем\nфайл' : 'Добавьте\nвыписку'}
        </DisplayText>
        <Text style={styles.emptyDescription}>
          {picking
            ? 'Проверяем формат и размер документа.'
            : 'Найдём платежи, которые повторяются каждый месяц.'}
        </Text>
      </View>
      <View style={styles.uploadFooter}>
        <Text style={styles.uploadMeta}>PDF или CSV · до 10 МиБ</Text>
        <Button
          title={picking ? 'Проверяем файл…' : 'Выбрать файл'}
          onPress={onPick}
          disabled={busy}
          icon={picking ? <ActivityIndicator color={color.ink} /> : undefined}
        />
      </View>
    </>
  );
}

export function FileConfirmation({
  file,
  busy,
  unavailable,
  cleanupFailed,
  onSubmit,
  onCancel,
  onReselect,
}: {
  file: LocalFile;
  busy: boolean;
  unavailable: boolean;
  cleanupFailed: boolean;
  onSubmit(): void;
  onCancel(): void;
  onReselect(): void;
}) {
  return (
    <>
      <View style={styles.card}>
        <View style={styles.confirmationHeading}>
          <IconTile size="medium">
            <ReceiptIcon
              size={30}
              color={color.ink}
            />
          </IconTile>
          <View style={styles.heading}>
            <Text style={[styles.fileName, styles.centeredText]}>{file.name}</Text>
            <Text style={[styles.muted, styles.centeredText]}>
              {cleanupFailed
                ? 'Отмена не завершена'
                : unavailable
                  ? 'Копия недоступна'
                  : 'Готов к отправке'}
            </Text>
          </View>
        </View>
        <View style={styles.divider} />
        <InfoRow
          label="Формат"
          value={file.format.toUpperCase()}
        />
        <InfoRow
          label="Размер"
          value={file.size.toLocaleString('ru-RU') + ' байт'}
        />
        {!unavailable && !cleanupFailed && (
          <View style={styles.status}>
            <CheckCircleIcon
              size={20}
              color={color.ink}
            />
            <Text style={[styles.muted, styles.flex]}>Формат проверен по содержимому</Text>
          </View>
        )}
      </View>
      <View style={styles.footer}>
        <View style={styles.actions}>
          {cleanupFailed ? (
            <Button
              title="Повторить очистку"
              onPress={onCancel}
              disabled={busy}
            />
          ) : (
            <>
              {unavailable ? (
                <Button
                  title="Выбрать файл заново"
                  onPress={onReselect}
                  disabled={busy}
                />
              ) : (
                <Button
                  title="Подтвердить и отправить"
                  onPress={onSubmit}
                  disabled={busy}
                  icon={
                    <ArrowUpRightIcon
                      size={20}
                      color={color.ink}
                    />
                  }
                />
              )}
              <Button
                title="Отменить выбор"
                onPress={onCancel}
                disabled={busy}
                secondary
              />
            </>
          )}
        </View>
      </View>
    </>
  );
}

export function ProgressState({
  busy,
  spinning,
  text,
  retryUpload,
  onRefresh,
  onSubmit,
  stage,
  reduceMotion,
  activityAllowed,
  fault,
}: {
  busy: boolean;
  spinning: boolean;
  text: string;
  retryUpload: boolean;
  onRefresh(): void;
  onSubmit(): void;
  stage: UploadProgressStage;
  reduceMotion: boolean;
  activityAllowed: boolean;
  fault: string | null;
}) {
  const failed = stage === 'error' || stage === 'delete-error';
  const paused = !spinning && !failed;
  const label = fault
    ? 'Нужно внимание'
    : failed
      ? stage === 'delete-error'
        ? 'УДАЛЕНИЕ НЕ ПОДТВЕРЖДЕНО'
        : 'ОШИБКА ОБРАБОТКИ'
      : paused
        ? 'ПРОВЕРКА ПРИОСТАНОВЛЕНА'
        : {
            sending: 'ПРОВЕРЯЕМ ПОЛУЧЕНИЕ',
            queued: 'ФАЙЛ В ОЧЕРЕДИ',
            processing: 'АНАЛИЗ ВЫПИСКИ',
            deleting: 'ЖДЁМ ПОДТВЕРЖДЕНИЕ',
            error: '',
            'delete-error': '',
          }[stage];
  return (
    <View
      style={[styles.card, styles.progressCard]}
      accessibilityLiveRegion="polite"
    >
      <View
        style={styles.stateHeading}
        accessibilityRole={fault ? 'alert' : undefined}
      >
        <ImportIllustration
          stage={paused || fault || stage === 'delete-error' ? 'error' : stage}
          active={activityAllowed}
          reduceMotion={reduceMotion}
        />
        <Text
          style={[
            styles.progressLabel,
            fault && styles.errorTitle,
            (failed || paused || !!fault) && styles.dangerText,
          ]}
        >
          {label}
        </Text>
        <View style={styles.progressDescription}>
          <Text style={styles.stateDescription}>{fault ? faultCopy(fault) : text}</Text>
        </View>
      </View>
      <UploadSteps
        stage={stage}
        paused={paused || !!fault}
      />
      <Button
        title="Проверить статус"
        onPress={onRefresh}
        disabled={busy}
        dimWhenDisabled={false}
        secondary
        icon={
          <ArrowClockwiseIcon
            size={20}
            color={color.ink}
          />
        }
      />
      {retryUpload && (
        <Button
          title="Восстановить отправку"
          label="Восстановить / повторить с тем же ключом"
          onPress={onSubmit}
          disabled={busy}
        />
      )}
    </View>
  );
}

export function ImportReport({
  job,
  busy,
  reduceMotion,
  activityAllowed,
  onRefresh,
  onDetails,
}: {
  job: Job;
  busy: boolean;
  reduceMotion: boolean;
  activityAllowed: boolean;
  onRefresh(): void;
  onDetails(item: Item): void;
}) {
  return (
    <>
      <View style={styles.totalCard}>
        <View style={styles.infoRow}>
          <Text style={styles.totalLabel}>Всего в месяц</Text>
          <View
            accessible
            testID="import-status"
            accessibilityLabel="Статус импорта"
            accessibilityValue={{ text: job.status + ' · revision ' + job.revision }}
            style={styles.status}
          >
            <ImportIllustration
              stage="success"
              size={22}
              active={activityAllowed}
              reduceMotion={reduceMotion}
            />
            <Text style={styles.statusText}>Готово</Text>
          </View>
        </View>
        <DisplayText
          testID="monthly-total"
          style={styles.total}
        >
          {money((job.items || []).reduce((sum, item) => sum + item.amountMinor, 0))}
          <Text style={styles.totalUnit}> AUD</Text>
        </DisplayText>
        <View style={styles.totalFooter}>
          <Text style={styles.statusText}>Платежей: {job.items?.length || 0}</Text>
          <Text style={styles.statusText}>Ежемесячно</Text>
        </View>
      </View>
      <View style={styles.list}>
        <View style={styles.header}>
          <Text
            accessibilityRole="header"
            style={[styles.sectionTitle, styles.flex]}
          >
            Найденные списания
          </Text>
          <IconButton
            label="Проверить статус"
            onPress={onRefresh}
            disabled={busy}
            busy={busy}
            dimWhenDisabled={false}
          >
            <ArrowClockwiseIcon
              size={22}
              color={color.ink}
            />
          </IconButton>
        </View>
        {job.items?.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.body}>Регулярные списания не найдены.</Text>
          </View>
        ) : (
          <View style={styles.listBody}>
            {job.items?.map((item, index) => (
              <React.Fragment key={item.id}>
                {index > 0 && <View style={styles.rowDivider} />}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={'Подробнее: ' + item.merchant}
                  accessibilityHint={
                    money(item.amountMinor) +
                    ' AUD в месяц. Открывает дату и периодичность списания.'
                  }
                  onPress={() => onDetails(item)}
                  style={({ pressed }) => [styles.merchant, pressed && styles.pressed]}
                >
                  <View style={styles.merchantTop}>
                    <View style={styles.monogram}>
                      <Text style={styles.monogramText}>
                        {item.merchant.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.merchantName}>{item.merchant}</Text>
                    <CaretRightIcon
                      size={18}
                      color={color.muted}
                    />
                  </View>
                  <View style={styles.merchantBottom}>
                    <Text style={styles.muted}>Ежемесячно</Text>
                    <Text style={styles.merchantAmount}>{money(item.amountMinor)} AUD</Text>
                  </View>
                </Pressable>
              </React.Fragment>
            ))}
          </View>
        )}
      </View>
    </>
  );
}

export function CleanupState({
  busy,
  onRefresh,
  reduceMotion,
  activityAllowed,
}: {
  busy: boolean;
  onRefresh(): void;
  reduceMotion: boolean;
  activityAllowed: boolean;
}) {
  return (
    <View style={[styles.card, styles.progressCard]}>
      <ImportIllustration
        stage="deleting"
        active={busy && activityAllowed}
        reduceMotion={reduceMotion}
      />
      <Text style={styles.stateDescription}>
        Сервер подтвердил удаление. Очистите оставшуюся временную копию, чтобы начать новый импорт.
      </Text>
      <Button
        title="Повторить очистку копии"
        onPress={onRefresh}
        disabled={busy}
        secondary
      />
    </View>
  );
}

export function CancellationCleanupState({
  busy,
  onRetry,
  reduceMotion,
  activityAllowed,
}: {
  busy: boolean;
  onRetry(): void;
  reduceMotion: boolean;
  activityAllowed: boolean;
}) {
  return (
    <View style={[styles.card, styles.progressCard]}>
      <ImportIllustration
        stage="deleting"
        active={busy && activityAllowed}
        reduceMotion={reduceMotion}
      />
      <Text style={styles.stateDescription}>
        Сохранён запрос отмены. Завершите очистку временной копии, чтобы вернуться к выбору файла.
      </Text>
      <Button
        title="Повторить отмену"
        onPress={onRetry}
        disabled={busy}
        secondary
      />
    </View>
  );
}

export function CancellationErrorNotice({
  message,
  busy,
  onRetry,
}: {
  message: string;
  busy: boolean;
  onRetry(): void;
}) {
  return (
    <View
      style={styles.cancellationNotice}
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.muted}>{message}</Text>
      <Button
        title="Повторить"
        onPress={onRetry}
        disabled={busy}
        secondary
      />
    </View>
  );
}
