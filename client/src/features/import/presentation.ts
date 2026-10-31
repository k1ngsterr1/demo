import type { Snapshot } from '../../core/controller';
import { MAX_PENDING_CANCELLATIONS } from '../../core/cancellations';
import type { Journal } from '../../core/model';

export const importMessages: Record<string, string> = {
  oversize: 'Файл больше 10 МиБ. Выберите выписку меньшего размера.',
  unsupported: 'Содержимое не соответствует PDF или CSV из набора. Файл не отправлен.',
  picker: 'Не удалось прочитать файл. Скачайте его на устройство и выберите ещё раз.',
  network:
    'Нет ответа от сервера. Исход запроса может быть неизвестен. Проверьте подключение и восстановите статус.',
  timeout: 'Сервер не ответил вовремя. Проверьте подключение и восстановите статус.',
  'wait-stopped': 'Ожидание остановлено. Сохранённую операцию можно проверить позже.',
  'cancellation-queue-full': 'Сначала завершите проверку отменённых импортов.',
  'not-found-yet':
    'Импорт пока не найден. Это не подтверждает отказ. Можно снова проверить статус или повторить с тем же ключом и файлом.',
  'http-503': 'Сервер временно недоступен. Удаление не подтверждено. Повтор сохранит прежний ключ.',
  'http-409':
    'Конфликт ключа и содержимого. Операция остановлена; новый импорт автоматически не создаётся.',
  'http-404':
    'Сервер не нашёл сохранённый импорт. Проверьте адрес и состояние mock; запись сохранена.',
  'http-413': 'Сервер отклонил размер файла. Операция сохранена для проверки статуса.',
  'http-415': 'Сервер отклонил формат файла. Операция сохранена для проверки статуса.',
  storage:
    'Не удалось сохранить состояние. Проверьте свободное место. Отправка без сохранённого ключа запрещена.',
  'storage-corrupt':
    'Сохранённая запись повреждена. Работа остановлена, чтобы не создать повторный импорт. См. восстановление в README.',
  cleanup: 'Не удалось очистить локальную копию. Запись сохранена; повторите проверку для очистки.',
  'file-missing':
    'Временная копия недоступна. Проверьте статус на сервере. Автоматической повторной отправки не будет.',
  'selection-file-missing': 'Временная копия недоступна. Выберите файл заново или отмените выбор.',
  'file-changed': 'Временный файл изменился. Повторная отправка остановлена.',
  'bad-response': 'Сервер вернул неожиданный ответ. Последнее подтверждённое состояние сохранено.',
  'wrong-job': 'Ответ относится к другой операции. Последнее состояние сохранено.',
  'bad-url': 'Укажите http://localhost:8787 или явно выбранный частный LAN IPv4-адрес.',
  'settings-load':
    'Не удалось прочитать адрес сервера. Откройте настройки и сохраните адрес ещё раз.',
  'settings-save': 'Не удалось сохранить адрес. Проверьте свободное место и повторите попытку.',
  'settings-busy': 'Дождитесь завершения сохранения настроек.',
  'operation-active': 'Сначала завершите текущую операцию.',
};
export const formatDate = (iso: string) => iso.split('-').reverse().join('.');

function getImportTitle(state: Snapshot, cancellationCleanup: boolean, ready: boolean): string {
  if (state.booting) {
    return 'Открываем выписку';
  }
  if (cancellationCleanup) {
    return 'Завершаем отмену';
  }

  switch (state.operation?.phase) {
    case 'deleted':
      return state.operation.file ? 'Завершаем очистку' : 'Добавьте выписку';
    case 'delete_failed':
      return 'Удаление не подтверждено';
    case 'deleting':
      return 'Удаляем импорт';
    case 'selected':
      return 'Проверьте файл';
    case 'uncertain':
      return 'Проверяем отправку';
  }

  if (ready) {
    return 'Регулярные списания';
  }

  switch (state.operation?.job?.status) {
    case 'processing':
      return 'Обрабатываем выписку';
    case 'queued':
      return 'Импорт в очереди';
    case 'error':
      return 'Ошибка обработки';
    default:
      return 'Расходы, которые повторяются';
  }
}

function getProgressCopy(operation: Journal | null): string {
  switch (operation?.phase) {
    case 'uncertain':
      return 'Проверим, получил ли сервер файл. Повторная отправка возможна только с вашим подтверждением.';
    case 'delete_failed':
      return 'Сервер пока не подтвердил удаление. Данные могут оставаться в отчёте.';
    case 'deleting':
      return 'Ждём подтверждение сервера. После этого очистим локальную копию, если она осталась.';
  }

  switch (operation?.job?.status) {
    case 'error':
      return 'Не удалось подготовить отчёт. Проверьте статус или удалите этот импорт.';
    case 'queued':
      return 'Файл получен. Обработка начнётся автоматически.';
    default:
      return 'Ищем регулярные списания. Отчёт появится здесь, когда обработка завершится.';
  }
}

function getImportSubtitle(operation: Journal | null, ready: boolean): string | null {
  if (operation?.phase === 'selected') {
    return 'Всё верно? Подтвердите отправку на обработку.';
  }
  if (ready) {
    return 'Ваш ежемесячный итог по выписке.';
  }
  return null;
}

function getCancellationIssue(state: Snapshot): string | null {
  return state.pendingCancellations.length >= MAX_PENDING_CANCELLATIONS
    ? 'Сначала завершите удаление предыдущих импортов, чтобы выбрать новый файл.'
    : null;
}

/** Pure presentation derived from the one durable operation, never another workflow store. */
export function getImportPresentation(
  state: Snapshot,
  picking = false,
  localFault: string | null = null,
) {
  const op = state.operation;
  const job = op?.job;
  const busy = (state.busy && !state.checkingCancellations) || picking || state.cancelling;
  const cancellationCleanup =
    !!op && state.pendingCancellations.some(entry => entry.key === op.key);
  const originalFault = localFault || state.fault;
  const selectionUnavailable =
    op?.phase === 'selected' &&
    ['file-missing', 'file-changed', 'unsupported', 'oversize'].includes(originalFault || '');
  const selectionCleanupFailed = op?.phase === 'selected' && originalFault === 'cleanup';
  const fault =
    op?.phase === 'selected' && originalFault === 'file-missing'
      ? 'selection-file-missing'
      : originalFault;
  const canPick =
    !state.booting &&
    !state.cancelling &&
    state.pendingCancellations.length < MAX_PENDING_CANCELLATIONS &&
    (!op || (op.phase === 'deleted' && !op.file));
  const ready = !cancellationCleanup && op?.phase === 'active' && job?.status === 'ready';
  const isDeleted = op?.phase === 'deleted';
  const working = !!op && !['selected', 'deleted'].includes(op.phase) && !ready;
  const deletionPending =
    op?.phase === 'deleting' || (job?.status === 'deleting' && op?.phase !== 'delete_failed');
  const canCancelTransfer =
    !!op &&
    !state.booting &&
    !deletionPending &&
    (op.phase === 'uncertain' || op.phase === 'active');
  const title = getImportTitle(state, cancellationCleanup, ready);
  const progressCopy = getProgressCopy(op);
  const subtitle = getImportSubtitle(op, ready);
  return {
    title,
    subtitle,
    busy,
    fault,
    canPick,
    ready,
    isDeleted,
    working,
    progressCopy,
    selectionUnavailable,
    selectionCleanupFailed,
    cancellationCleanup,
    cancellationIssue: getCancellationIssue(state),
    canCancelTransfer,
    showStopWaiting: !state.booting && !cancellationCleanup && working && !canCancelTransfer,
    retryUpload: !cancellationCleanup && op?.phase === 'uncertain' && !!op.file,
    spinning: state.busy || (!fault && job?.status !== 'error'),
    canDelete:
      !cancellationCleanup &&
      !deletionPending &&
      !!op &&
      !!job &&
      !['selected', 'deleted'].includes(op.phase),
  };
}
