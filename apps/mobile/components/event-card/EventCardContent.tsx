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
import type { EventCardData } from './types';

type EventCardContentProps = {
  event: EventCardData;
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
  const tags = event.tags ?? [];
  const people = event.people ?? [];
  const significanceStyle = getSignificanceStyle(significance, colors);
  const categoryColor = event.categoryColor
    ? eventColors[event.categoryColor][isDark ? 'dark' : 'light']
    : colors.border;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${event.title}, ${significanceLabels[significance]} significance`}
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
        title={event.title}
        time={event.time}
        significance={significance}
        significanceStyle={significanceStyle}
        colors={colors}
        isExpanded={isExpanded}
        onTitleOverflowChange={onTitleOverflowChange}
      />

      <EventCardMetadata
        title={event.title}
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
            {event.location}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
