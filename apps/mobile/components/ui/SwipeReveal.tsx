import { radius } from '@lel/design';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

type OpenSwipe = {
  id: symbol;
  close: () => void;
};

let openSwipe: OpenSwipe | null = null;

export function closeOpenSwipe() {
  if (!openSwipe) return false;

  const current = openSwipe;
  openSwipe = null;
  current.close();
  return true;
}

type SwipeRevealProps = {
  action: ReactNode;
  actionWidth: number;
  children: ReactNode;
  enabled?: boolean;
};

export default function SwipeReveal({
  action,
  actionWidth,
  children,
  enabled = true,
}: SwipeRevealProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const idRef = useRef(Symbol('swipe-reveal'));
  const startOffsetRef = useRef(0);
  const isOpenRef = useRef(false);

  const animateTo = useCallback(
    (value: number) => {
      isOpenRef.current = value !== 0;

      if (value !== 0) {
        if (openSwipe?.id !== idRef.current) closeOpenSwipe();
        openSwipe = { id: idRef.current, close: () => animateTo(0) };
      } else if (openSwipe?.id === idRef.current) {
        openSwipe = null;
      }

      Animated.spring(translateX, {
        toValue: value,
        friction: 7,
        tension: 40,
        useNativeDriver: true,
      }).start();
    },
    [translateX]
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .runOnJS(true)
        .activeOffsetX([-12, 12])
        .failOffsetY([-10, 10])
        .onBegin(() => {
          if (openSwipe?.id !== idRef.current) closeOpenSwipe();
          startOffsetRef.current = isOpenRef.current ? -actionWidth : 0;
        })
        .onUpdate((event) => {
          const nextPosition = Math.max(
            -actionWidth,
            Math.min(0, startOffsetRef.current + event.translationX / 2)
          );
          translateX.setValue(nextPosition);
        })
        .onEnd((event) => {
          const projectedPosition =
            startOffsetRef.current +
            event.translationX / 2 +
            event.velocityX * 0.04;
          animateTo(projectedPosition < -actionWidth / 2 ? -actionWidth : 0);
        }),
    [actionWidth, animateTo, enabled, translateX]
  );

  useEffect(() => {
    if (!enabled) animateTo(0);
  }, [animateTo, enabled]);

  return (
    <View style={styles.root}>
      <View style={[styles.action, { width: actionWidth }]}>{action}</View>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={{ transform: [{ translateX }] }}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: radius.sm,
  },
  action: {
    position: 'absolute',
    top: 2,
    right: 4,
    bottom: 2,
  },
});
