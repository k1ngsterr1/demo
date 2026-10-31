import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { color } from '../ui/theme';

const VISIBLE_MS = 1100;
const BACKGROUND = '#14271F';

// A bounded brand introduction on a fresh process. Recovery runs underneath;
// neither storage nor the network can keep this screen open.
export function StartupScreen({
  onFinish,
  foreground: active,
  reduceMotion: motionPreference,
}: {
  onFinish(): void;
  foreground: boolean;
  reduceMotion: boolean;
}) {
  const [laidOut, setLaidOut] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const reduceMotion = useRef(motionPreference);
  const opacity = useRef(new Animated.Value(1)).current;
  const logoY = useRef(new Animated.Value(0)).current;
  const titleY = useRef(new Animated.Value(12)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0.45)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    reduceMotion.current = motionPreference;
  }, [motionPreference]);

  useEffect(() => {
    if (!laidOut || !imageReady) {
      return;
    }
    // Match the native background/logo before revealing the animated wordmark.
    SplashScreen.setOptions({ fade: false });
    SplashScreen.hide();
  }, [imageReady, laidOut]);

  useEffect(() => {
    if (!laidOut || !imageReady || !active) {
      return;
    }
    opacity.setValue(1);
    let entrance: Animated.CompositeAnimation | undefined;
    let breathing: Animated.CompositeAnimation | undefined;
    if (reduceMotion.current) {
      logoY.setValue(-92);
      titleY.setValue(0);
      titleOpacity.setValue(1);
      pulse.setValue(1);
    } else {
      logoY.setValue(0);
      titleY.setValue(12);
      titleOpacity.setValue(0);
      entrance = Animated.parallel([
        Animated.timing(logoY, {
          toValue: -92,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(100),
          Animated.parallel([
            Animated.timing(titleOpacity, { toValue: 1, duration: 320, useNativeDriver: true }),
            Animated.timing(titleY, {
              toValue: 0,
              duration: 320,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]);
      entrance.start();
      breathing = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 420,
            useNativeDriver: true,
            isInteraction: false,
          }),
          Animated.timing(pulse, {
            toValue: 0.45,
            duration: 420,
            useNativeDriver: true,
            isInteraction: false,
          }),
        ]),
      );
      breathing.start();
    }
    const timer = setTimeout(() => {
      if (reduceMotion.current) {
        onFinish();
        return;
      }
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished) {
            onFinish();
          }
        },
      );
    }, VISIBLE_MS);
    return () => {
      clearTimeout(timer);
      entrance?.stop();
      breathing?.stop();
      opacity.stopAnimation();
    };
  }, [active, imageReady, laidOut, logoY, onFinish, opacity, pulse, titleOpacity, titleY]);

  return (
    <Animated.View
      style={[s.screen, { opacity }]}
      testID="launch-screen"
      accessible
      accessibilityLabel="Statement Import. Запуск приложения."
      accessibilityViewIsModal
      onLayout={() => setLaidOut(true)}
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor={BACKGROUND}
      />
      <View
        style={s.brand}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Animated.View style={{ transform: [{ translateY: logoY }] }}>
          <Image
            source={require('../../assets/splash-mark.png')}
            style={s.logo}
            onLoad={() => setImageReady(true)}
            onError={() => setImageReady(true)}
          />
        </Animated.View>
        <Animated.View
          style={[s.wordmark, { opacity: titleOpacity, transform: [{ translateY: titleY }] }]}
        >
          <Text
            maxFontSizeMultiplier={1.25}
            style={s.name}
          >
            Statement
          </Text>
          <Text
            maxFontSizeMultiplier={1.25}
            style={[s.name, s.accent]}
          >
            Import
          </Text>
        </Animated.View>
      </View>
      <Animated.View
        style={[s.status, { bottom: insets.bottom + 30, opacity: titleOpacity }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Animated.View style={[s.dot, { opacity: pulse }]} />
      </Animated.View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFillObject, backgroundColor: BACKGROUND, zIndex: 1 },
  brand: {
    position: 'absolute',
    top: '50%',
    left: 24,
    right: 24,
    alignItems: 'center',
    transform: [{ translateY: -56 }],
  },
  logo: { width: 112, height: 112 },
  wordmark: { position: 'absolute', top: 72, left: 0, right: 0, alignItems: 'center' },
  name: {
    fontSize: 43,
    lineHeight: 48,
    fontWeight: '600',
    letterSpacing: -1.6,
    color: '#F8FAF9',
    textAlign: 'center',
  },
  accent: { color: color.accent },
  status: {
    position: 'absolute',
    left: 24,
    right: 24,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: color.accent },
});
