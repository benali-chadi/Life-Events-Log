import { radius, spacing } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { Image } from 'expo-image';
import { Check, ImageOff, X } from 'lucide-react-native';
import { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AttachmentPreview } from './types';

type AttachmentCarouselProps = {
  attachments: AttachmentPreview[];
  onOpen: (index: number) => void;
  onRemove: (attachment: AttachmentPreview) => void;
  onLongPress?: (attachment: AttachmentPreview) => void;
  onToggleSelection?: (attachment: AttachmentPreview) => void;
  selectedIds?: ReadonlySet<string>;
  selectionMode?: boolean;
};

export default function AttachmentCarousel({
  attachments,
  onOpen,
  onRemove,
  onLongPress,
  onToggleSelection,
  selectedIds = new Set(),
  selectionMode = false,
}: AttachmentCarouselProps) {
  const { colors } = useTheme();
  const suppressPressRef = useRef<string | null>(null);

  return (
    <ScrollView
      horizontal
      contentContainerStyle={styles.content}
      showsHorizontalScrollIndicator={false}
    >
      {attachments.map((attachment, index) => (
        <View key={attachment.id} style={styles.thumbnailContainer}>
          <Pressable
            accessibilityLabel={
              selectionMode
                ? `${selectedIds.has(attachment.id) ? 'Deselect' : 'Select'} ${attachment.filename}`
                : `Open attachment ${index + 1}`
            }
            accessibilityRole={selectionMode ? 'checkbox' : 'imagebutton'}
            accessibilityState={
              selectionMode
                ? { checked: selectedIds.has(attachment.id) }
                : undefined
            }
            onLongPress={() => {
              if (!selectionMode && onLongPress) {
                suppressPressRef.current = attachment.id;
              }
              onLongPress?.(attachment);
            }}
            onPress={() => {
              if (suppressPressRef.current === attachment.id) {
                suppressPressRef.current = null;
                return;
              }
              if (selectionMode) onToggleSelection?.(attachment);
              else onOpen(index);
            }}
            style={({ pressed }) => [
              styles.thumbnailButton,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
              pressed && styles.pressed,
            ]}
          >
            {attachment.isAvailable ? (
              <Image
                contentFit="cover"
                source={{ uri: attachment.uri }}
                style={styles.thumbnail}
                transition={150}
              />
            ) : (
              <View style={styles.unavailable}>
                <ImageOff color={colors.textMuted} size={22} />
                <Text
                  style={[styles.unavailableText, { color: colors.textMuted }]}
                >
                  Missing file
                </Text>
              </View>
            )}
          </Pressable>

          {selectionMode && (
            <View
              pointerEvents="none"
              style={[
                styles.selectionControl,
                {
                  backgroundColor: selectedIds.has(attachment.id)
                    ? colors.primary
                    : colors.surface,
                  borderColor: selectedIds.has(attachment.id)
                    ? colors.primary
                    : colors.borderStrong,
                },
              ]}
            >
              {selectedIds.has(attachment.id) && (
                <Check color={colors.onPrimary} size={15} strokeWidth={3} />
              )}
            </View>
          )}

          {!selectionMode && (
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
          )}
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
  unavailable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
  },
  unavailableText: {
    fontSize: 12,
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
  selectionControl: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderRadius: 13,
  },
  pressed: {
    opacity: 0.78,
  },
});
