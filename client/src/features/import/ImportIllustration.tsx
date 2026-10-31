import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { color } from '../../ui/theme';

type IllustrationStage =
  | 'idle'
  | 'checking'
  | 'sending'
  | 'queued'
  | 'processing'
  | 'deleting'
  | 'success'
  | 'error';

type IllustrationProps = {
  stage: IllustrationStage;
  active: boolean;
  reduceMotion: boolean;
  size?: number;
};

const duration: Record<IllustrationStage, number> = {
  idle: 650,
  checking: 2400,
  sending: 2000,
  queued: 4800,
  processing: 2400,
  deleting: 2400,
  success: 500,
  error: 0,
};

/** Decorative SVG layers: native transforms only, never a percentage or a server-state clock. */
export function ImportIllustration({ stage, active, reduceMotion, size = 120 }: IllustrationProps) {
  const [scenes, setScenes] = useState([{ stage, id: 0 }]);
  const current = scenes[scenes.length - 1]!;

  // Preserve the exact in-flight opacity when stages change faster than a transition.
  // Only decorative SVGs overlap; status text and controls always use current data.
  if (current.stage !== stage) {
    setScenes([...(active && !reduceMotion ? scenes : []), { stage, id: current.id + 1 }]);
  }
  const removeScene = useCallback((id: number) => {
    setScenes(currentScenes => {
      if (currentScenes[currentScenes.length - 1]?.id === id) return currentScenes;
      return currentScenes.filter(scene => scene.id !== id);
    });
  }, []);

  return (
    <View
      style={[art.frame, { width: size, height: size }]}
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <View style={[art.canvas, { transform: [{ scale: size / 120 }] }]}>
        {scenes.map(scene => (
          <CrossfadingScene
            key={scene.id}
            id={scene.id}
            stage={scene.stage}
            leaving={scene.id !== current.id}
            active={active}
            reduceMotion={reduceMotion}
            onExited={removeScene}
          />
        ))}
      </View>
    </View>
  );
}

function CrossfadingScene({
  id,
  stage,
  leaving,
  active,
  reduceMotion,
  onExited,
}: Omit<IllustrationProps, 'size'> & {
  id: number;
  leaving: boolean;
  onExited(id: number): void;
}) {
  const opacity = useRef(new Animated.Value(id === 0 || reduceMotion || !active ? 1 : 0)).current;
  useLayoutEffect(() => {
    if (reduceMotion || !active) {
      opacity.setValue(leaving ? 0 : 1);
      if (leaving) onExited(id);
      return;
    }
    let cancelled = false;
    const animation = Animated.timing(opacity, {
      toValue: leaving ? 0 : 1,
      duration: 420,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
      isInteraction: false,
    });
    animation.start(({ finished }) => {
      if (finished && leaving && !cancelled) onExited(id);
    });
    return () => {
      cancelled = true;
      animation.stop();
    };
  }, [active, id, leaving, onExited, opacity, reduceMotion]);

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        {
          opacity,
          transform: [
            { scale: opacity.interpolate({ inputRange: [0, 1], outputRange: [0.975, 1] }) },
          ],
        },
      ]}
    >
      <IllustrationScene
        stage={stage}
        active={active && !leaving}
        reduceMotion={reduceMotion}
      />
    </Animated.View>
  );
}

/** Outgoing artwork freezes in place while fading; it contains no text or controls. */
function IllustrationScene({ stage, active, reduceMotion }: Omit<IllustrationProps, 'size'>) {
  const once = stage === 'idle' || stage === 'success';
  const pingPong = stage === 'checking' || stage === 'processing' || stage === 'deleting';
  const restingProgress = once ? 1 : stage === 'sending' ? 0.35 : 0;
  const progress = useRef(new Animated.Value(restingProgress)).current;
  useEffect(() => {
    if (reduceMotion || stage === 'error') {
      progress.setValue(restingProgress);
      return;
    }
    if (!active) {
      return;
    }
    progress.setValue(0);
    const timing = (toValue: number) =>
      Animated.timing(progress, {
        toValue,
        duration: pingPong ? duration[stage] / 2 : duration[stage],
        easing: once
          ? Easing.out(Easing.cubic)
          : pingPong
            ? Easing.inOut(Easing.sin)
            : Easing.linear,
        useNativeDriver: true,
        isInteraction: false,
      });
    const cycle = pingPong ? Animated.sequence([timing(1), timing(0)]) : timing(1);
    const animation = once ? cycle : Animated.loop(cycle);
    animation.start();
    return () => animation.stop();
  }, [active, once, pingPong, progress, reduceMotion, restingProgress, stage]);

  return (
    <>
      {stage !== 'success' && (
        <Layer>
          <Rect
            x={12}
            y={12}
            width={96}
            height={96}
            rx={30}
            fill={stage === 'error' ? color.dangerSoft : color.accentSoft}
            stroke="none"
          />
        </Layer>
      )}
      <Artwork
        stage={stage}
        progress={progress}
      />
    </>
  );
}

function Layer({
  children,
  style,
}: {
  children: ReactNode;
  style?: React.ComponentProps<typeof Animated.View>['style'];
}) {
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <Svg
        width={120}
        height={120}
        viewBox="0 0 120 120"
      >
        <G
          fill="none"
          stroke={color.ink}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {children}
        </G>
      </Svg>
    </Animated.View>
  );
}

function Document({ lines = true }: { lines?: boolean }) {
  return (
    <>
      <Path
        d="M43 28h25l15 15v44a3 3 0 0 1-3 3H43a3 3 0 0 1-3-3V31a3 3 0 0 1 3-3Z"
        fill={color.surface}
      />
      <Path d="M68 28v15h15" />
      {lines && (
        <Path
          d="M49 54h24M49 64h24M49 74h14"
          stroke={color.muted}
        />
      )}
    </>
  );
}

function Artwork({ stage, progress }: { stage: IllustrationStage; progress: Animated.Value }) {
  switch (stage) {
    case 'idle':
      return (
        <>
          <Layer style={{ transform: [{ rotate: '-10deg' }, { translateX: -6 }] }}>
            <Rect
              x={39}
              y={31}
              width={42}
              height={59}
              rx={4}
              fill={color.accent}
              stroke="none"
            />
          </Layer>
          <Layer
            style={{
              opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
              transform: [
                { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [7, 0] }) },
                {
                  rotate: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['5deg', '0deg'],
                  }),
                },
              ],
            }}
          >
            <Document />
            <Circle
              cx={85}
              cy={83}
              r={14}
              fill={color.ink}
              stroke={color.accentSoft}
              strokeWidth={3}
            />
            <Path
              d="M85 77v12M79 83h12"
              stroke={color.accent}
            />
          </Layer>
        </>
      );
    case 'checking':
    case 'processing':
      return (
        <>
          <Layer>
            <Document />
          </Layer>
          <Layer
            style={{
              transform: [
                { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 30] }) },
              ],
            }}
          >
            <Rect
              x={35}
              y={46}
              width={53}
              height={10}
              rx={5}
              fill={color.accent}
              fillOpacity={0.5}
              stroke="none"
            />
            <Path
              d="M34 51h55"
              stroke="#689344"
              strokeWidth={2}
            />
            <Circle
              cx={89}
              cy={51}
              r={3}
              fill={color.ink}
              stroke="none"
            />
          </Layer>
        </>
      );
    case 'sending':
      return (
        <>
          <Layer>
            <Document lines={false} />
            <Path
              d="M49 79h24"
              stroke={color.line}
            />
          </Layer>
          <Layer
            style={{
              opacity: progress.interpolate({
                inputRange: [0, 0.2, 0.7, 1],
                outputRange: [0, 1, 1, 0],
              }),
              transform: [
                { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [7, -7] }) },
              ],
            }}
          >
            <Path
              d="M61 72V51m-8 8 8-8 8 8"
              strokeWidth={2.5}
            />
          </Layer>
        </>
      );
    case 'queued':
      return (
        <>
          <Layer>
            <Circle
              cx={60}
              cy={60}
              r={27}
              fill={color.surface}
            />
            <Path
              d="M60 38v3M82 60h-3M60 82v-3M38 60h3"
              stroke={color.muted}
            />
            <Path
              d="M60 60h12"
              strokeWidth={2.5}
            />
          </Layer>
          <Layer
            style={{
              transform: [
                {
                  rotate: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '360deg'],
                  }),
                },
              ],
            }}
          >
            <Path
              d="M60 60V45"
              strokeWidth={2.5}
            />
            <Circle
              cx={60}
              cy={60}
              r={3}
              fill={color.ink}
              stroke="none"
            />
            <Circle
              cx={60}
              cy={25}
              r={3}
              fill="#689344"
              stroke="none"
            />
          </Layer>
        </>
      );
    case 'deleting':
      return (
        <>
          <Layer
            style={{
              transform: [
                { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-4, 6] }) },
              ],
            }}
          >
            <Rect
              x={46}
              y={29}
              width={28}
              height={35}
              rx={3}
              fill={color.surface}
            />
            <Path
              d="M52 38h16M52 45h11"
              stroke={color.muted}
            />
          </Layer>
          <Layer>
            <Path
              d="m40 57 4 31h32l4-31Z"
              fill={color.accentSoft}
            />
            <Path d="M36 56h48M54 64v15M66 64v15" />
          </Layer>
        </>
      );
    case 'success':
      return (
        <Layer
          style={{
            transform: [
              {
                scale: progress.interpolate({
                  inputRange: [0, 0.7, 1],
                  outputRange: [0.7, 1.04, 1],
                }),
              },
            ],
          }}
        >
          <Circle
            cx={60}
            cy={60}
            r={48}
            fill={color.ink}
            stroke="none"
          />
          <Path
            d="m38 60 15 15 29-30"
            stroke={color.accent}
            strokeWidth={8}
          />
        </Layer>
      );
    case 'error':
      return (
        <Layer>
          <Circle
            cx={60}
            cy={60}
            r={25}
            stroke={color.danger}
          />
          <Path
            d="M60 46v17"
            stroke={color.danger}
            strokeWidth={2.5}
          />
          <Circle
            cx={60}
            cy={73}
            r={1.5}
            fill={color.danger}
            stroke="none"
          />
        </Layer>
      );
  }
}

const art = StyleSheet.create({
  frame: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  canvas: { width: 120, height: 120 },
});
