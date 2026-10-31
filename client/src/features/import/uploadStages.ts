import type { Journal } from '../../core/model';

export type UploadProgressStage =
  | 'sending'
  | 'queued'
  | 'processing'
  | 'error'
  | 'deleting'
  | 'delete-error';

export function getUploadTransitionKey(
  operation: Journal | null,
  picking: boolean,
  fault: string | null,
) {
  return [
    operation?.key ?? 'empty',
    operation?.phase ?? 'empty',
    operation?.job?.status ?? '',
    picking ? 'picking' : 'idle',
    fault ?? 'clear',
  ].join(':');
}

/** Visual projection only; the controller remains the sole owner of progress. */
export function getUploadProgressStage(operation: Journal | null): UploadProgressStage | null {
  if (operation?.phase === 'deleting') return 'deleting';
  if (operation?.phase === 'delete_failed') return 'delete-error';
  if (operation?.phase === 'uncertain') return 'sending';
  if (operation?.phase !== 'active') return null;
  if (operation?.job?.status === 'error') return 'error';
  if (operation?.job?.status === 'queued') return 'queued';
  if (operation?.job?.status === 'processing') return 'processing';
  if (operation?.job?.status === 'deleting') return 'deleting';
  return null;
}

export function getUploadSteps(stage: UploadProgressStage) {
  if (stage === 'deleting' || stage === 'delete-error') return null;
  const current = stage === 'sending' ? 0 : 1;
  return ['Файл', 'Обработка', 'Отчёт'].map(
    (label, index) =>
      ({
        label,
        state:
          index < current
            ? 'complete'
            : index === current
              ? stage === 'error'
                ? 'error'
                : 'current'
              : 'pending',
      }) as const,
  );
}
