import React, { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

/** Keep live content mounted. Status changes must not restart SVG motion or recreate controls. */
type FadeInProps = {
  children: ReactNode;
  transitionKey: string;
  reduceMotion: boolean;
  style?: StyleProp<ViewStyle>;
};

export function FadeIn({ children, transitionKey, reduceMotion, style }: FadeInProps) {
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const entering = useRef(true);
  useEffect(() => {
    const initial = entering.current;
    entering.current = false;
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    progress.setValue(initial ? 0 : 0.94);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: initial ? 320 : 220,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
      isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reduceMotion, transitionKey]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
