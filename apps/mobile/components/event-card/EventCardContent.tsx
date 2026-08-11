import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { eventColors } from '@lel/design';
import type { useTheme } from '@lel/design/useTheme';
import { Pressable, Text, View } from 'react-native';
import EventCardExpandedContent from './EventCardExpandedContent';
import EventCardHeader from './EventCardHeader';
import EventCardMetadata from './EventCardMetadata';
import {
  getSignificanceStyle,
  significanceLabels,
} from './eventCardSignificance';
import { eventCardStyles as styles } from './eventCardStyles';
import type { EventSignificance } from '@/models';
import type { EventListItem } from '@/data/repositories';

type EventCardContentProps = {
  event: EventListItem;
  significance: EventSignificance;
  colors: ReturnType<typeof useTheme>['colors'];
  isDark: boolean;
  hasExpandableContent: boolean;
  isExpanded: boolean;
  onOpen: () => void;
  onToggleExpanded: () => void;
  onTitleOverflowChange: (hasOverflow: boolean) => void;
};

export default function EventCardContent({
  event,
  significance,
  colors,
  isDark,
  hasExpandableContent,
  isExpanded,
  onOpen,
  onToggleExpanded,
  onTitleOverflowChange,
}: EventCardContentProps) {
  const tags = event.tags.map((tag) => tag.name);
  const people = event.people.map((person) => person.name);
  const significanceStyle = getSignificanceStyle(significance, colors);
  const categoryColor = event.category
    ? eventColors[event.category.color][isDark ? 'dark' : 'light']
    : colors.border;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${event.event.title}, ${significanceLabels[significance]} significance`}
      onPress={onOpen}
      style={({ pressed }) => [
        styles.card,
        significanceStyle.card,
        {
          backgroundColor: pressed
            ? colors.interactivePressed
            : significanceStyle.backgroundColor,
          borderColor: significanceStyle.borderColor,
          borderWidth: significanceStyle.borderWidth,
          borderLeftColor: categoryColor,
          borderLeftWidth: 5,
        },
      ]}
    >
      {significance === 'turning-point' && (
        <View
          pointerEvents="none"
          style={[
            styles.turningPointInnerBorder,
            { borderColor: colors.border },
          ]}
        />
      )}

      <EventCardHeader
        title={event.event.title}
        time={event.event.time ?? undefined}
        significance={significance}
        significanceStyle={significanceStyle}
        colors={colors}
        isExpanded={isExpanded}
        onTitleOverflowChange={onTitleOverflowChange}
      />

      <EventCardMetadata
        title={event.event.title}
        tags={tags}
        people={people}
        colors={colors}
        hasExpandableContent={hasExpandableContent}
        isExpanded={isExpanded}
        onToggleExpanded={onToggleExpanded}
      />

      {isExpanded && hasExpandableContent && (
        <EventCardExpandedContent event={event} colors={colors} />
      )}

      {event.location && (
        <View style={styles.locationRow}>
          <MaterialIcons
            name="location-pin"
            size={10}
            color={colors.textMuted}
          />
          <Text style={[styles.locationText, { color: colors.textSecondary }]}>
            {event.location.name}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
