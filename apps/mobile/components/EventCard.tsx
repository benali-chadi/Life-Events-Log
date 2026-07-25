import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { eventColors, radius, spacing, typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { useRouter } from 'expo-router';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useEventDeletion } from './event-deletion/EventDeletionProvider';
import { confirmEventDeletion } from './event-deletion/confirmEventDeletion';
import SwipeReveal, { closeOpenSwipe } from './ui/SwipeReveal';

export type EventSignificance =
  'ordinary' | 'notable' | 'major' | 'turning-point';

export type LELEvent = {
  title: string;
  date: string;
  time?: string;
  createdAt: string;
  categoryColor?: keyof typeof eventColors;
  categoryName?: string;
  tags?: string[];
  location?: string;
  people?: string[];
  significance?: EventSignificance;
  notes?: string;
};

const COLLAPSED_ITEM_LIMIT = 2;

const significanceLabels: Record<EventSignificance, string> = {
  ordinary: 'Ordinary',
  notable: 'Notable',
  major: 'Major',
  'turning-point': 'Turning point',
};

const significanceLevels: Record<EventSignificance, number> = {
  ordinary: 1,
  notable: 2,
  major: 3,
  'turning-point': 4,
};

export default function EventCard({ event }: { event: LELEvent }) {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { deleteEvent } = useEventDeletion();
  const [isExpanded, setIsExpanded] = useState(false);

  const significance = event.significance ?? 'ordinary';
  const tags = event.tags ?? [];
  const people = event.people ?? [];

  const categoryColor = event.categoryColor
    ? eventColors[event.categoryColor][isDark ? 'dark' : 'light']
    : colors.border;

  const hasExpandableContent =
    tags.length > COLLAPSED_ITEM_LIMIT ||
    people.length > COLLAPSED_ITEM_LIMIT ||
    Boolean(event.categoryName || event.significance || event.notes);

  const visibleTags = isExpanded ? tags : tags.slice(0, COLLAPSED_ITEM_LIMIT);
  const visiblePeople = isExpanded
    ? people
    : people.slice(0, COLLAPSED_ITEM_LIMIT);

  const significanceStyle = useMemo(() => {
    switch (significance) {
      case 'notable':
        return {
          title: styles.notableTitle,
          card: styles.notableCard,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          backgroundColor: colors.surface,
          markerColor: colors.textMuted,
        };
      case 'major':
        return {
          title: styles.majorTitle,
          card: styles.majorCard,
          borderWidth: 1,
          borderColor: colors.textMuted,
          backgroundColor: colors.surfaceElevated,
          markerColor: colors.textSecondary,
        };
      case 'turning-point':
        return {
          title: styles.turningPointTitle,
          card: styles.turningPointCard,
          borderWidth: 2,
          borderColor: colors.textSecondary,
          backgroundColor: colors.interactiveMuted,
          markerColor: colors.textSecondary,
        };
      default:
        return {
          title: styles.ordinaryTitle,
          card: styles.ordinaryCard,
          borderWidth: 0,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          markerColor: colors.textMuted,
        };
    }
  }, [
    colors.border,
    colors.borderStrong,
    colors.interactiveMuted,
    colors.surface,
    colors.surfaceElevated,
    colors.textMuted,
    colors.textSecondary,
    significance,
  ]);

  const toggleExpanded = () => setIsExpanded((current) => !current);

  const card = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${event.title}, ${significanceLabels[significance]} significance`}
      onPress={() => {
        if (closeOpenSwipe()) return;

        router.navigate({
          pathname: '/[eventId]',
          params: { eventId: event.title, title: event.title },
        });
      }}
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

      <View style={styles.headerRow}>
        <Text
          style={[
            styles.title,
            significanceStyle.title,
            { color: colors.text },
          ]}
        >
          {event.title}
        </Text>
        <View style={styles.headerMeta}>
          {event.time && (
            <Text style={[styles.date, { color: colors.textMuted }]}>
              {event.time}
            </Text>
          )}
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.significanceMarker}
          >
            {Array.from({ length: significanceLevels[significance] }).map(
              (_, index) => (
                <View
                  key={index}
                  style={[
                    styles.significanceSegment,
                    { backgroundColor: significanceStyle.markerColor },
                  ]}
                />
              )
            )}
          </View>
        </View>
      </View>

      {(tags.length > 0 || people.length > 0 || hasExpandableContent) && (
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
            {!isExpanded && tags.length > COLLAPSED_ITEM_LIMIT && (
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
            {!isExpanded && people.length > COLLAPSED_ITEM_LIMIT && (
              <Text style={[styles.metadataText, { color: colors.textMuted }]}>
                +{people.length - COLLAPSED_ITEM_LIMIT}
              </Text>
            )}
          </View>

          {hasExpandableContent && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                isExpanded ? `Collapse ${event.title}` : `Expand ${event.title}`
              }
              accessibilityState={{ expanded: isExpanded }}
              hitSlop={spacing[2]}
              onPress={(pressEvent) => {
                pressEvent.stopPropagation();
                toggleExpanded();
              }}
              style={({ pressed }) => [
                styles.expandButton,
                pressed && { backgroundColor: colors.interactivePressed },
              ]}
            >
              {isExpanded ? (
                <ChevronUp color={colors.textMuted} size={15} strokeWidth={2} />
              ) : (
                <ChevronDown
                  color={colors.textMuted}
                  size={15}
                  strokeWidth={2}
                />
              )}
              <Text style={[styles.expandText, { color: colors.textMuted }]}>
                {isExpanded ? 'Collapse' : 'Expand'}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {isExpanded && hasExpandableContent && (
        <View
          style={[styles.expandedContent, { borderTopColor: colors.border }]}
        >
          {event.categoryName && (
            <DetailRow
              label="Category"
              value={event.categoryName}
              colors={colors}
            />
          )}
          {event.significance && (
            <DetailRow
              label="Significance"
              value={significanceLabels[significance]}
              colors={colors}
            />
          )}
          {event.notes && (
            <Text
              numberOfLines={1}
              style={[styles.notes, { color: colors.textSecondary }]}
            >
              {event.notes}
            </Text>
          )}
        </View>
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

  return (
    <SwipeReveal
      actionWidth={80}
      action={
        <Pressable
          accessibilityLabel={`Delete ${event.title}`}
          accessibilityRole="button"
          onPress={() =>
            confirmEventDeletion(event.title, () => deleteEvent(event.title))
          }
          style={styles.deleteAction}
        >
          <Trash2 color="#FFFFFF" size={19} strokeWidth={2} />
          <Text style={styles.deleteText}>Delete</Text>
        </Pressable>
      }
    >
      {card}
    </SwipeReveal>
  );
}

type DetailRowProps = {
  label: string;
  value: string;
  colors: ReturnType<typeof useTheme>['colors'];
};

function DetailRow({ label, value, colors }: DetailRowProps) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>
        {label}
      </Text>
      <Text style={[styles.detailValue, { color: colors.textSecondary }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  deleteAction: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: radius.sm,
    backgroundColor: '#B42318',
  },
  deleteText: {
    ...typography.caption,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  card: {
    minHeight: 50,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: radius.sm,
    gap: spacing[2],
  },
  ordinaryCard: {
    padding: spacing[2],
  },
  notableCard: {
    padding: 10,
  },
  majorCard: {
    padding: spacing[3],
    gap: spacing[3],
  },
  turningPointCard: {
    padding: spacing[4],
    gap: spacing[3],
  },
  turningPointInnerBorder: {
    position: 'absolute',
    top: 4,
    right: 4,
    bottom: 4,
    left: 8,
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing[2],
    alignItems: 'flex-start',
  },
  title: {
    flex: 1,
  },
  ordinaryTitle: {
    ...typography.body,
  },
  notableTitle: {
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '500',
  },
  majorTitle: {
    fontSize: 19,
    lineHeight: 27,
    fontWeight: '600',
  },
  turningPointTitle: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '700',
  },
  headerMeta: {
    flexShrink: 0,
    alignItems: 'flex-end',
    gap: spacing[1],
  },
  date: {
    ...typography.caption,
  },
  significanceMarker: {
    height: 3,
    flexDirection: 'row',
    gap: 2,
  },
  significanceSegment: {
    width: 8,
    height: 2,
    borderRadius: 1,
  },
  previewRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  metadataValues: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[1],
  },
  metadataText: {
    ...typography.caption,
  },
  expandButton: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: radius.sm,
    paddingHorizontal: spacing[1],
  },
  expandText: {
    ...typography.caption,
  },
  expandedContent: {
    borderTopWidth: 1,
    paddingTop: spacing[2],
    gap: spacing[1],
  },
  detailRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  detailLabel: {
    ...typography.caption,
    width: 80,
  },
  detailValue: {
    ...typography.caption,
    flex: 1,
  },
  notes: {
    ...typography.small,
    marginTop: spacing[1],
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
  },
  locationText: {
    ...typography.caption,
  },
});
