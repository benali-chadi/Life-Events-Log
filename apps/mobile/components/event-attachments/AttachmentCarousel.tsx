import { radius, spacing } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { EventAttachment } from './types';

type AttachmentCarouselProps = {
  attachments: EventAttachment[];
  onOpen: (index: number) => void;
  onRemove: (attachment: EventAttachment) => void;
};

export default function AttachmentCarousel({
  attachments,
  onOpen,
  onRemove,
}: AttachmentCarouselProps) {
  const { colors } = useTheme();

  return (
    <ScrollView
      horizontal
      contentContainerStyle={styles.content}
      showsHorizontalScrollIndicator={false}
    >
      {attachments.map((attachment, index) => (
        <View key={attachment.id} style={styles.thumbnailContainer}>
          <Pressable
            accessibilityLabel={`Open attachment ${index + 1}`}
            accessibilityRole="imagebutton"
            onPress={() => onOpen(index)}
            style={({ pressed }) => [
              styles.thumbnailButton,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
              pressed && styles.pressed,
            ]}
          >
            <Image
              contentFit="cover"
              source={{ uri: attachment.uri }}
              style={styles.thumbnail}
              transition={150}
            />
          </Pressable>

          <Pressable
            accessibilityLabel={`Remove ${attachment.filename}`}
            accessibilityRole="button"
            hitSlop={6}
            onPress={() => onRemove(attachment)}
            style={[
              styles.removeButton,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <X color={colors.text} size={14} strokeWidth={2.25} />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing[3],
    paddingHorizontal: spacing[1],
    paddingVertical: spacing[1],
  },
  thumbnailContainer: {
    position: 'relative',
  },
  thumbnailButton: {
    width: 136,
    height: 104,
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: radius.md,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  removeButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 14,
  },
  pressed: {
    opacity: 0.78,
  },
});
