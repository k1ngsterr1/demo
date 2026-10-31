import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Snapshot } from '../../core/controller';
import { Fault, type LocalFile } from '../../core/model';
import type { ImportControllerPort, ImportServices } from './services';
import { useServerSettings } from './useServerSettings';
import { CancellationRecovery } from './cancellationRecovery';

const INITIAL_SNAPSHOT: Snapshot = {
  operation: null,
  busy: false,
  booting: true,
  fault: null,
  pendingCancellations: [],
  cancelling: false,
  checkingCancellations: false,
  cancellationFault: null,
};
const idleSnapshot = () => INITIAL_SNAPSHOT;
const idleSubscribe = () => () => {};
const POLL_DELAY_MS = 900;

export function useImportFlow(services: ImportServices, foreground: boolean) {
  const [controller, setController] = useState<ImportControllerPort | null>(null);
  const settings = useServerSettings(services);
  const { baseUrl } = settings;
  const [picking, setPicking] = useState(false);
  const [localFault, setLocalFault] = useState<string | null>(null);
  const pickerBusy = useRef(false);
  const cancellationRecovery = useRef<CancellationRecovery | null>(null);
  const state = useSyncExternalStore(
    controller?.subscribe ?? idleSubscribe,
    controller?.snapshot ?? idleSnapshot,
  );

  useEffect(() => {
    // A fresh owner for each committed setup, including StrictMode's setup/cleanup/setup.
    const instance = services.createController();
    setController(instance);
    void instance.boot();
    return () => instance.dispose();
  }, [services]);

  useEffect(() => {
    if (!controller || !foreground || picking) {
      return;
    }
    const recovery = new CancellationRecovery(controller);
    cancellationRecovery.current = recovery;
    return () => {
      if (cancellationRecovery.current === recovery) {
        cancellationRecovery.current = null;
      }
      void recovery.stop();
    };
  }, [controller, foreground, picking]);

  useEffect(() => {
    if (foreground && controller?.shouldPoll) {
      void controller.refresh();
    }
  }, [controller, foreground]);

  useEffect(() => {
    if (!foreground || !controller || state.busy || !controller.shouldPoll) {
      return;
    }
    const timer = setTimeout(() => {
      void controller.refresh();
    }, POLL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [controller, foreground, state]);

  const pick = useCallback(async () => {
    if (
      !settings.ready ||
      settings.busy ||
      !controller ||
      (controller.snapshot().busy && !controller.snapshot().checkingCancellations) ||
      controller.snapshot().booting ||
      pickerBusy.current
    ) {
      return;
    }
    const recovery = cancellationRecovery.current;
    pickerBusy.current = true;
    setPicking(true);
    setLocalFault(null);
    let file: LocalFile | null = null;
    try {
      // Yield the shared controller to the explicit user action before opening Files.
      await recovery?.stop();
      await controller.interruptCancellationCheck();
      if (controller.snapshot().busy || controller.snapshot().booting) {
        return;
      }
      file = await services.pickFile();
      if (file) {
        await controller.select(file, baseUrl);
        if (controller.snapshot().operation?.file?.stagedId !== file.stagedId) {
          await services.removeFile(file);
        }
      }
    } catch (error) {
      setLocalFault(error instanceof Fault ? error.code : 'picker');
    } finally {
      pickerBusy.current = false;
      setPicking(false);
    }
  }, [baseUrl, controller, services, settings.ready, settings.busy]);

  const reselect = useCallback(async () => {
    if (!controller || controller.snapshot().operation?.phase !== 'selected') {
      return;
    }
    await controller.cancelSelection();
    if (!controller.snapshot().operation) {
      await pick();
    }
  }, [controller, pick]);

  return {
    state,
    picking,
    localFault: settings.fault ?? localFault,
    baseUrl,
    pick,
    reselect,
    changeBaseUrl: settings.save,
    settingsReady: settings.ready,
    settingsBusy: settings.busy,
    recover: () => {
      void controller?.boot();
    },
    submit: () => {
      void controller?.submit();
    },
    cancel: () => {
      void controller?.cancelSelection();
    },
    cancelImport: (key?: string) => {
      void controller?.cancelImport(key);
    },
    stopWaiting: () => controller?.stopWaiting(),
    reconcileCancellations: () => {
      cancellationRecovery.current?.retry();
    },
    refresh: () => {
      void controller?.refresh();
    },
    deleteImport: () => {
      void controller?.deleteImport();
    },
  };
}
