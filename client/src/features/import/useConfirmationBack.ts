import { useCallback, useLayoutEffect, useRef } from 'react';
import { BackHandler } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { Snapshot } from '../../core/controller';

/** Installed on the persistent root route before the picker can open confirmation. */
export function useConfirmationBack(flow: { state: Snapshot; cancel(): void }) {
  const current = useRef(flow);
  const pendingCancellation = useRef<string | null>(null);
  useLayoutEffect(() => {
    current.current = flow;
    const requested = pendingCancellation.current;
    if (!requested) {
      return;
    }
    const { state, cancel } = flow;
    if (
      state.booting ||
      state.operation?.phase !== 'selected' ||
      state.operation.key !== requested
    ) {
      pendingCancellation.current = null;
    } else if (!state.busy) {
      pendingCancellation.current = null;
      cancel();
    }
  }, [flow]);
  useFocusEffect(
    useCallback(() => {
      const listener = BackHandler.addEventListener('hardwareBackPress', () => {
        const { state, cancel } = current.current;
        if (state.booting || state.operation?.phase !== 'selected') {
          return false;
        }
        // Wait for real cancellation/cleanup before the journal selects ImportHome.
        if (state.busy) {
          pendingCancellation.current = state.operation.key;
        } else {
          cancel();
        }
        return true;
      });
      // Root focus is lost while Settings/Details is on top: their native Back wins.
      return () => {
        pendingCancellation.current = null;
        listener.remove();
      };
    }, []),
  );
}
