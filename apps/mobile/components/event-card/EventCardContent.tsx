import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { eventColors } from '@lel/design';
import type { useTheme } from '@lel/design/useTheme';
import { Pressable, Text, View } from 'react-native';
import EventCardExpandedContent from './EventCardExpandedContent';
import EventCardAttachmentPreview from './EventCardAttachmentPreview';
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
  hasConflicts?: boolean;
  significance: EventSignificance;
  colors: ReturnType<typeof useTheme>['colors'];
  isDark: boolean;
  hasExpandableContent: boolean;
  isExpanded: boolean;
  onOpen: () => void;
  onLongPress?: () => void;
  onToggleExpanded: () => void;
  onTitleOverflowChange: (hasOverflow: boolean) => void;
};

export default function EventCardContent({
  event,
  hasConflicts = false,
  significance,
  colors,
  isDark,
  hasExpandableContent,
  isExpanded,
  onOpen,
  onLongPress,
  onToggleExpanded,
  onTitleOverflowChange,
}: EventCardContentProps) {
  const tags = event.tags.map((tag) => tag.displayName ?? tag.name);
  const people = event.people.map(
    (person) => person.displayName ?? person.name
  );
  const significanceStyle = getSignificanceStyle(significance, colors);
  const categoryColor = event.category
    ? eventColors[event.category.color][isDark ? 'dark' : 'light']
    : colors.border;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${event.event.title}, ${significanceLabels[significance]} significance${hasConflicts ? ', has unresolved conflicts' : ''}`}
      onPress={onOpen}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.card,
        significanceStyle.card,
        isExpanded && styles.expandedCard,
        {
          backgroundColor: pressed
            ? colors.interactivePressed
            : isExpanded
              ? colors.surface
              : significanceStyle.backgroundColor,
        },
      ]}
    >
      <EventCardHeader
        hasConflicts={hasConflicts}
        title={event.event.title}
        time={event.event.time ?? undefined}
        significance={significance}
        significanceStyle={significanceStyle}
        colors={colors}
        isExpanded={isExpanded}
        onTitleOverflowChange={onTitleOverflowChange}
      />

      {!isExpanded && event.event.notesPreview && (
        <Text
          numberOfLines={significance === 'ordinary' ? 1 : 3}
          style={[styles.notes, { color: colors.textSecondary }]}
        >
          {event.event.notesPreview}
        </Text>
      )}
      {event.attachmentPreview && (
        <EventCardAttachmentPreview
          attachment={event.attachmentPreview}
          attachmentCount={event.attachmentCount}
          colors={colors}
          prominent={
            significance === 'major' || significance === 'turning-point'
          }
        />
      )}
      {event.category && (
        <Text style={[styles.metadataText, { color: categoryColor }]}>
          {event.category.displayName ?? event.category.name}
        </Text>
      )}
      <EventCardMetadata
        title={event.event.title}
        tags={tags}
        people={people}
        colors={colors}
        hasExpandableContent={hasExpandableContent}
        isExpanded={isExpanded}
        onToggleExpanded={onToggleExpanded}
      />

      {event.location && (
        <View style={styles.locationRow}>
          <MaterialIcons
            name="location-pin"
            size={10}
            color={colors.textMuted}
          />
          <Text style={[styles.locationText, { color: colors.textSecondary }]}>
            {event.location.displayName ?? event.location.name}
          </Text>
        </View>
      )}
      {isExpanded && (
        <>
          <EventCardExpandedContent event={event} colors={colors} />
          {event.event.notesPreview && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Collapse ${event.event.title} notes`}
              onPress={(e) => {
                e.stopPropagation();
                onToggleExpanded();
              }}
              style={{ paddingVertical: 12 }}
            >
              <Text style={[styles.metadataText, { color: colors.textMuted }]}>
                Collapse notes
              </Text>
            </Pressable>
          )}
        </>
      )}
    </Pressable>
  );
}
