import { overlay, spacing, typography } from '@lel/design';
import { ImageOff, Share2, X } from 'lucide-react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  StatusBar,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { shareAttachment } from '@/data/attachments';
import type { AttachmentPreview } from './types';
import ZoomableAttachmentImage from './ZoomableAttachmentImage';

type AttachmentViewerProps = {
  attachments: AttachmentPreview[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
};

export default function AttachmentViewer({
  attachments,
  initialIndex,
  visible,
  onClose,
}: AttachmentViewerProps) {
  const { width, height } = useWindowDimensions();
  const listRef = useRef<FlatList<AttachmentPreview>>(null);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isSharing, setIsSharing] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const activeAttachment = attachments[activeIndex];

  useEffect(() => {
    if (!visible) return;

    setActiveIndex(initialIndex);
    setControlsVisible(true);
    setIsZoomed(false);
    controlsOpacity.setValue(1);
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({
        animated: false,
        offset: initialIndex * width,
      });
    });
  }, [controlsOpacity, initialIndex, visible, width]);

  const setControlVisibility = (nextVisible: boolean) => {
    setControlsVisible(nextVisible);
    Animated.timing(controlsOpacity, {
      duration: 160,
      toValue: nextVisible ? 1 : 0,
      useNativeDriver: true,
    }).start();
  };

  const toggleControls = () => {
    if (isZoomed) return;
    setControlVisibility(!controlsVisible);
  };

  const hideControls = () => {
    if (controlsVisible) setControlVisibility(false);
  };

  const startZoom = () => {
    setIsZoomed(true);
    hideControls();
  };

  const positionAtInitialIndex = () => {
    setActiveIndex(initialIndex);
    listRef.current?.scrollToOffset({
      animated: false,
      offset: initialIndex * width,
    });
  };

  const shareActiveAttachment = async () => {
    if (!activeAttachment?.isAvailable || isSharing) return;

    setIsSharing(true);
    try {
      await shareAttachment(activeAttachment);
    } catch {
      Alert.alert(
        'Couldn’t share attachment',
        'The attachment could not be shared. Please try again.'
      );
    } finally {
      setIsSharing(false);
    }
  };

  const updateActiveIndex = (
    event: NativeSyntheticEvent<NativeScrollEvent>
  ) => {
    setIsZoomed(false);
    setActiveIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  return (
    <Modal
      animationType="fade"
      onShow={positionAtInitialIndex}
      onRequestClose={onClose}
      statusBarTranslucent
      visible={visible}
    >
      <GestureHandlerRootView style={styles.root}>
        <FlatList
          ref={listRef}
          data={attachments}
          decelerationRate="fast"
          getItemLayout={(_, index) => ({
            index,
            length: width,
            offset: width * index,
          })}
          horizontal
          keyExtractor={(attachment) => attachment.id}
          onMomentumScrollEnd={updateActiveIndex}
          pagingEnabled
          renderItem={({ item, index }) => (
            <View style={[styles.slide, { width }]}>
              {item.isAvailable ? (
                <ZoomableAttachmentImage
                  active={visible && index === activeIndex}
                  imageHeight={item.height}
                  imageWidth={item.width}
                  onSingleTap={toggleControls}
                  onZoomChange={setIsZoomed}
                  onZoomStart={startZoom}
                  uri={item.uri}
                  viewportHeight={height}
                  viewportWidth={width}
                />
              ) : (
                <Pressable
                  accessibilityLabel={
                    controlsVisible
                      ? 'Hide viewer controls'
                      : 'Show viewer controls'
                  }
                  onPress={toggleControls}
                  style={styles.unavailable}
                >
                  <ImageOff color={overlay.onMediaViewer} size={36} />
                  <Text style={styles.unavailableText}>
                    This file is not available on this device.
                  </Text>
                </Pressable>
              )}
            </View>
          )}
          scrollEnabled={!isZoomed}
          showsHorizontalScrollIndicator={false}
        />

        <Animated.View
          pointerEvents={controlsVisible ? 'auto' : 'none'}
          style={[
            styles.header,
            Platform.OS === 'android' && {
              paddingTop: StatusBar.currentHeight ?? 0,
            },
            { opacity: controlsOpacity },
          ]}
        >
          <SafeAreaView>
            <View style={styles.headerContent}>
              <Pressable
                accessibilityLabel="Close attachment viewer"
                accessibilityRole="button"
                hitSlop={8}
                onPress={onClose}
                style={styles.controlButton}
              >
                <X color={overlay.onMediaViewer} size={24} strokeWidth={2} />
              </Pressable>

              <View style={styles.titleContainer}>
                <Text numberOfLines={1} style={styles.filename}>
                  {activeAttachment?.filename ?? 'Attachment'}
                </Text>
                <Text style={styles.counter}>
                  {activeIndex + 1} of {attachments.length}
                </Text>
              </View>

              <Pressable
                accessibilityLabel="Share attachment"
                accessibilityRole="button"
                disabled={!activeAttachment?.isAvailable || isSharing}
                hitSlop={8}
                onPress={() => void shareActiveAttachment()}
                style={({ pressed }) => [
                  styles.controlButton,
                  (!activeAttachment?.isAvailable || isSharing) &&
                    styles.disabledControl,
                  pressed && styles.pressedControl,
                ]}
              >
                {isSharing ? (
                  <ActivityIndicator
                    color={overlay.onMediaViewer}
                    size="small"
                  />
                ) : (
                  <Share2
                    color={overlay.onMediaViewer}
                    size={22}
                    strokeWidth={2}
                  />
                )}
              </Pressable>
            </View>
          </SafeAreaView>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: overlay.mediaViewer,
  },
  slide: {
    flex: 1,
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  unavailable: {
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[6],
  },
  unavailableText: {
    ...typography.small,
    color: overlay.onMediaViewer,
    textAlign: 'center',
  },
  header: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    backgroundColor: overlay.mediaControls,
  },
  headerContent: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  filename: {
    ...typography.small,
    maxWidth: '100%',
    color: overlay.onMediaViewer,
    fontWeight: '600',
  },
  counter: {
    ...typography.small,
    color: overlay.onMediaViewer,
    fontWeight: '600',
  },
  controlButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledControl: {
    opacity: 0.4,
  },
  pressedControl: {
    opacity: 0.65,
  },
});
