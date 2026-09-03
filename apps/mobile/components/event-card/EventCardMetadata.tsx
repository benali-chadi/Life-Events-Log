import { spacing } from '@lel/design';
import type { useTheme } from '@lel/design/useTheme';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { eventCardStyles as styles } from './eventCardStyles';

const COLLAPSED_ITEM_LIMIT = 2;

type EventCardMetadataProps = {
  title: string;
  tags: string[];
  people: string[];
  colors: ReturnType<typeof useTheme>['colors'];
  hasExpandableContent: boolean;
  isExpanded: boolean;
  onToggleExpanded: () => void;
};

export default function EventCardMetadata({
  title,
  tags,
  people,
  colors,
  hasExpandableContent,
  isExpanded,
  onToggleExpanded,
}: EventCardMetadataProps) {
  const visibleTags = tags.slice(0, COLLAPSED_ITEM_LIMIT);
  const visiblePeople = people.slice(0, COLLAPSED_ITEM_LIMIT);

  if (tags.length === 0 && people.length === 0 && !hasExpandableContent) {
    return null;
  }

  return (
    <View style={styles.previewRow}>
      <View style={styles.metadataValues}>
        {visibleTags.map((tag) => (
          <Text
            key={tag}
            style={[styles.metadataText, { color: colors.textMuted }]}
          >
            #{tag}
          </Text>
        ))}
        {tags.length > COLLAPSED_ITEM_LIMIT && (
          <Text style={[styles.metadataText, { color: colors.textMuted }]}>
            +{tags.length - COLLAPSED_ITEM_LIMIT}
          </Text>
        )}

        {visiblePeople.map((person) => (
          <Text
            key={person}
            style={[styles.metadataText, { color: colors.textMuted }]}
          >
            @{person}
          </Text>
        ))}
        {people.length > COLLAPSED_ITEM_LIMIT && (
          <Text style={[styles.metadataText, { color: colors.textMuted }]}>
            +{people.length - COLLAPSED_ITEM_LIMIT}
          </Text>
        )}
      </View>

      {hasExpandableContent && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            isExpanded ? `Collapse ${title}` : `Expand ${title}`
          }
          accessibilityState={{ expanded: isExpanded }}
          hitSlop={spacing[2]}
          onPress={(pressEvent) => {
            pressEvent.stopPropagation();
            onToggleExpanded();
          }}
          style={({ pressed }) => [
            styles.expandButton,
            pressed && { backgroundColor: colors.interactivePressed },
          ]}
        >
          {isExpanded ? (
            <ChevronUp color={colors.textMuted} size={15} strokeWidth={2} />
          ) : (
            <ChevronDown color={colors.textMuted} size={15} strokeWidth={2} />
          )}
          <Text style={[styles.expandText, { color: colors.textMuted }]}>
            {isExpanded ? 'Collapse' : 'Expand'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
