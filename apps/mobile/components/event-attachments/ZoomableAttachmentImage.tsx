import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

type ZoomableAttachmentImageProps = {
  uri: string;
  imageWidth: number | null;
  imageHeight: number | null;
  viewportWidth: number;
  viewportHeight: number;
  active: boolean;
  onSingleTap: () => void;
  onZoomStart: () => void;
  onZoomChange: (isZoomed: boolean) => void;
};

function clamp(value: number, minimum: number, maximum: number) {
  'worklet';
  return Math.min(Math.max(value, minimum), maximum);
}

export default function ZoomableAttachmentImage({
  uri,
  imageWidth,
  imageHeight,
  viewportWidth,
  viewportHeight,
  active,
  onSingleTap,
  onZoomStart,
  onZoomChange,
}: ZoomableAttachmentImageProps) {
  const [panEnabled, setPanEnabled] = useState(false);
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const imageAspectRatio =
    imageWidth && imageHeight
      ? imageWidth / imageHeight
      : viewportWidth / viewportHeight;
  const viewportAspectRatio = viewportWidth / viewportHeight;
  const fittedWidth =
    imageAspectRatio > viewportAspectRatio
      ? viewportWidth
      : viewportHeight * imageAspectRatio;
  const fittedHeight =
    imageAspectRatio > viewportAspectRatio
      ? viewportWidth / imageAspectRatio
      : viewportHeight;

  const boundedX = (value: number, nextScale: number) => {
    'worklet';
    const maximum = Math.max(0, (fittedWidth * nextScale - viewportWidth) / 2);
    return clamp(value, -maximum, maximum);
  };
  const boundedY = (value: number, nextScale: number) => {
    'worklet';
    const maximum = Math.max(
      0,
      (fittedHeight * nextScale - viewportHeight) / 2
    );
    return clamp(value, -maximum, maximum);
  };

  const updateZoomState = (zoomed: boolean) => {
    setPanEnabled(zoomed);
    onZoomChange(zoomed);
  };

  const resetZoom = () => {
    'worklet';
    scale.value = withTiming(1);
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    scheduleOnRN(updateZoomState, false);
  };

  useEffect(() => {
    if (active) return;

    scale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    setPanEnabled(false);
  }, [active, scale, translateX, translateY]);

  const pinch = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
      scheduleOnRN(onZoomStart);
    })
    .onUpdate((event) => {
      const nextScale = clamp(savedScale.value * event.scale, 1, MAX_SCALE);
      const ratio = nextScale / savedScale.value;
      const nextX =
        ratio * savedTranslateX.value +
        (1 - ratio) * (event.focalX - viewportWidth / 2);
      const nextY =
        ratio * savedTranslateY.value +
        (1 - ratio) * (event.focalY - viewportHeight / 2);

      scale.value = nextScale;
      translateX.value = boundedX(nextX, nextScale);
      translateY.value = boundedY(nextY, nextScale);
    })
    .onEnd(() => {
      if (scale.value <= 1.01) resetZoom();
      else scheduleOnRN(updateZoomState, true);
    });

  const pan = Gesture.Pan()
    .enabled(panEnabled)
    .minDistance(8)
    .onBegin(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate((event) => {
      if (scale.value <= 1) return;
      translateX.value = boundedX(
        savedTranslateX.value + event.translationX,
        scale.value
      );
      translateY.value = boundedY(
        savedTranslateY.value + event.translationY,
        scale.value
      );
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(220)
    .maxDuration(180)
    .maxDistance(8)
    .onEnd((event, success) => {
      if (!success) return;
      scheduleOnRN(onZoomStart);

      if (scale.value > 1.01) {
        resetZoom();
        return;
      }

      const nextX = (1 - DOUBLE_TAP_SCALE) * (event.x - viewportWidth / 2);
      const nextY = (1 - DOUBLE_TAP_SCALE) * (event.y - viewportHeight / 2);
      scale.value = withTiming(DOUBLE_TAP_SCALE);
      translateX.value = withTiming(boundedX(nextX, DOUBLE_TAP_SCALE));
      translateY.value = withTiming(boundedY(nextY, DOUBLE_TAP_SCALE));
      scheduleOnRN(updateZoomState, true);
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .enabled(!panEnabled)
    .maxDistance(8)
    .onEnd((_, success) => {
      if (success) scheduleOnRN(onSingleTap);
    });

  const gesture = Gesture.Simultaneous(
    pinch,
    pan,
    Gesture.Exclusive(doubleTap, singleTap)
  );
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.image, animatedStyle]}>
        <Image contentFit="contain" source={{ uri }} style={styles.image} />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: '100%',
  },
});
