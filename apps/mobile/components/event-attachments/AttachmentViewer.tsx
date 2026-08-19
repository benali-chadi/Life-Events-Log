import { overlay, spacing, typography } from '@lel/design';
import { Image } from 'expo-image';
import { ImageOff, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { AttachmentPreview } from './types';

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
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<AttachmentPreview>>(null);
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  useEffect(() => {
    if (!visible) return;

    setActiveIndex(initialIndex);
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({
        animated: false,
        offset: initialIndex * width,
      });
    });
  }, [initialIndex, visible, width]);

  const updateActiveIndex = (
    event: NativeSyntheticEvent<NativeScrollEvent>
  ) => {
    setActiveIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      visible={visible}
    >
      <View style={styles.root}>
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
          renderItem={({ item }) => (
            <View style={[styles.slide, { width }]}>
              {item.isAvailable ? (
                <Image
                  contentFit="contain"
                  source={{ uri: item.uri }}
                  style={styles.image}
                />
              ) : (
                <View style={styles.unavailable}>
                  <ImageOff color={overlay.onMediaViewer} size={36} />
                  <Text style={styles.unavailableText}>
                    This file is not available on this device.
                  </Text>
                </View>
              )}
            </View>
          )}
          showsHorizontalScrollIndicator={false}
        />

        <View style={styles.header}>
          <Text style={styles.counter}>
            {activeIndex + 1} of {attachments.length}
          </Text>
          <Pressable
            accessibilityLabel="Close attachment viewer"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onClose}
            style={styles.closeButton}
          >
            <X color={overlay.onMediaViewer} size={24} strokeWidth={2} />
          </Pressable>
        </View>
      </View>
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
    minHeight: 80,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    padding: spacing[4],
    backgroundColor: overlay.mediaControls,
  },
  counter: {
    ...typography.small,
    color: overlay.onMediaViewer,
    fontWeight: '600',
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
