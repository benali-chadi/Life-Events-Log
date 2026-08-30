import { radius, spacing, typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { GripVertical, ImageOff } from 'lucide-react-native';
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AttachmentPreview } from './types';

type AttachmentReorderCarouselProps = {
  attachments: AttachmentPreview[];
  onOrderChange: (attachments: AttachmentPreview[]) => void;
};

export default function AttachmentReorderCarousel({
  attachments,
  onOrderChange,
}: AttachmentReorderCarouselProps) {
  const { colors } = useTheme();

  const move = (from: number, offset: -1 | 1) => {
    const to = from + offset;
    if (to < 0 || to >= attachments.length) return;

    const reordered = [...attachments];
    const [attachment] = reordered.splice(from, 1);
    if (!attachment) return;
    reordered.splice(to, 0, attachment);
    onOrderChange(reordered);
    void Haptics.selectionAsync();
  };

  const renderItem = ({
    item,
    drag,
    isActive,
    getIndex,
  }: RenderItemParams<AttachmentPreview>) => {
    const index = getIndex() ?? 0;

    return (
      <ScaleDecorator activeScale={1.04}>
        <Pressable
          accessibilityActions={[
            { name: 'decrement', label: 'Move left' },
            { name: 'increment', label: 'Move right' },
          ]}
          accessibilityHint="Long press and drag to change its position"
          accessibilityLabel={`${item.filename}, position ${index + 1} of ${attachments.length}`}
          accessibilityRole="adjustable"
          disabled={isActive}
          delayLongPress={180}
          onAccessibilityAction={({ nativeEvent }) => {
            if (nativeEvent.actionName === 'decrement') move(index, -1);
            if (nativeEvent.actionName === 'increment') move(index, 1);
          }}
          onLongPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            drag();
          }}
          style={[
            styles.item,
            {
              backgroundColor: colors.surface,
              borderColor: isActive ? colors.primary : colors.border,
            },
            isActive && styles.activeItem,
          ]}
        >
          {item.isAvailable ? (
            <Image
              contentFit="cover"
              source={{ uri: item.uri }}
              style={styles.thumbnail}
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

          <View style={[styles.position, { backgroundColor: colors.surface }]}>
            <GripVertical color={colors.textSecondary} size={15} />
            <Text
              style={[styles.positionText, { color: colors.textSecondary }]}
            >
              {index + 1}
            </Text>
          </View>
        </Pressable>
      </ScaleDecorator>
    );
  };

  return (
    <DraggableFlatList
      activationDistance={8}
      autoscrollSpeed={120}
      autoscrollThreshold={48}
      contentContainerStyle={styles.content}
      data={attachments}
      horizontal
      keyExtractor={(attachment) => attachment.id}
      onDragEnd={({ data, from, to }) => {
        onOrderChange(data);
        if (from !== to) void Haptics.selectionAsync();
      }}
      renderItem={renderItem}
      showsHorizontalScrollIndicator={false}
      style={styles.list}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    height: 114,
  },
  content: {
    gap: spacing[3],
    paddingHorizontal: spacing[1],
    paddingVertical: spacing[1],
  },
  item: {
    width: 136,
    height: 104,
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: radius.md,
  },
  activeItem: {
    borderWidth: 2,
    opacity: 0.94,
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
  position: {
    position: 'absolute',
    right: spacing[1],
    bottom: spacing[1],
    minWidth: 38,
    height: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing[1],
  },
  positionText: {
    ...typography.small,
    fontWeight: '700',
  },
});
