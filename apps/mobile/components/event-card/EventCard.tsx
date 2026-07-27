import { useTheme } from '@lel/design/useTheme';
import { useRouter } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useEventDeletion } from '../event-deletion/EventDeletionProvider';
import { confirmEventDeletion } from '../event-deletion/confirmEventDeletion';
import SwipeReveal, { closeOpenSwipe } from '../ui/SwipeReveal';
import EventCardContent from './EventCardContent';
import { eventCardStyles as styles } from './eventCardStyles';
import type { LELEvent } from './types';

type EventCardProps = {
  event: LELEvent;
};

export default function EventCard({ event }: EventCardProps) {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { deleteEvent } = useEventDeletion();
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasTitleOverflow, setHasTitleOverflow] = useState(false);

  const significance = event.significance ?? 'ordinary';
  const hasExpandableContent =
    hasTitleOverflow ||
    (event.tags?.length ?? 0) > 2 ||
    (event.people?.length ?? 0) > 2 ||
    Boolean(event.categoryName || event.significance || event.notes);

  const handleTitleOverflowChange = useCallback((hasOverflow: boolean) => {
    setHasTitleOverflow(hasOverflow);
  }, []);

  const openEvent = () => {
    if (closeOpenSwipe()) return;

    router.navigate({
      pathname: '/[eventId]',
      params: { eventId: event.title, title: event.title },
    });
  };

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
          style={({ pressed }) => [
            styles.deleteAction,
            {
              backgroundColor: pressed
                ? colors.destructiveSurfacePressed
                : colors.destructiveSurface,
            },
          ]}
        >
          <Trash2 color={colors.onDestructive} size={19} strokeWidth={2} />
          <Text style={[styles.deleteText, { color: colors.onDestructive }]}>
            Delete
          </Text>
        </Pressable>
      }
    >
      <EventCardContent
        event={event}
        significance={significance}
        colors={colors}
        isDark={isDark}
        hasExpandableContent={hasExpandableContent}
        isExpanded={isExpanded}
        onOpen={openEvent}
        onToggleExpanded={() => setIsExpanded((current) => !current)}
        onTitleOverflowChange={handleTitleOverflowChange}
      />
    </SwipeReveal>
  );
}
