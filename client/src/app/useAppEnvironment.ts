import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

/** One owner of native foreground/accessibility subscriptions for the whole app. */
export function useAppEnvironment() {
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(value => {
        if (mounted) {
          setReduceMotion(value);
        }
      })
      .catch(() => {
        /* Keep the conservative motion setting if the native query fails. */
      });
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const appState = AppState.addEventListener('change', value =>
      setForeground(value === 'active'),
    );
    return () => {
      mounted = false;
      motion.remove();
      appState.remove();
    };
  }, []);
  return { foreground, reduceMotion };
}
