import { useTheme } from '@lel/design/useTheme';
import { useRouter } from 'expo-router';
import { Check, Trash2 } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useEventDeletion } from '../event-deletion/EventDeletionProvider';
import { confirmEventDeletion } from '../event-deletion/confirmEventDeletion';
import SwipeReveal, { closeOpenSwipe } from '../ui/SwipeReveal';
import { useAppToast } from '../ui/AppToastProvider';
import EventCardContent from './EventCardContent';
import { eventCardStyles as styles } from './eventCardStyles';
import type { EventListItem } from '@/data/repositories';

type EventCardProps = {
  event: EventListItem;
  hasConflicts?: boolean;
  isSelected?: boolean;
  selectionMode?: boolean;
  onSelect?: () => void;
};

export default function EventCard({
  event,
  hasConflicts = false,
  isSelected = false,
  selectionMode = false,
  onSelect,
}: EventCardProps) {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { deleteEvent } = useEventDeletion();
  const { showToast } = useAppToast();
  const suppressNextOpenRef = useRef(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasTitleOverflow, setHasTitleOverflow] = useState(false);

  const significance = event.event.significance;
  const hasExpandableContent =
    hasTitleOverflow ||
    event.tags.length > 2 ||
    event.people.length > 2 ||
    Boolean(
      event.category ||
      event.event.significance ||
      event.event.notesPreview ||
      event.attachmentCount
    );

  const handleTitleOverflowChange = useCallback((hasOverflow: boolean) => {
    setHasTitleOverflow(hasOverflow);
  }, []);

  const openEvent = () => {
    if (suppressNextOpenRef.current) {
      suppressNextOpenRef.current = false;
      return;
    }

    if (closeOpenSwipe()) return;

    if (selectionMode) {
      onSelect?.();
      return;
    }

    router.navigate({
      pathname: '/[eventId]',
      params: { eventId: event.event.id },
    });
  };

  const startSelection = () => {
    suppressNextOpenRef.current = true;
    onSelect?.();
  };

  return (
    <View style={selectionMode && styles.selectionRow}>
      {selectionMode && (
        <Pressable
          accessibilityLabel={`${isSelected ? 'Deselect' : 'Select'} ${event.event.title}`}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isSelected }}
          hitSlop={8}
          onPress={onSelect}
          style={[
            styles.selectionControl,
            {
              backgroundColor: isSelected ? colors.primary : colors.bg,
              borderColor: isSelected ? colors.primary : colors.borderStrong,
            },
          ]}
        >
          {isSelected && (
            <Check color={colors.onPrimary} size={16} strokeWidth={3} />
          )}
        </Pressable>
      )}
      <View style={selectionMode && styles.selectionCard}>
        <SwipeReveal
          actionWidth={80}
          enabled={!selectionMode}
          action={
            selectionMode ? null : (
              <Pressable
                accessibilityLabel={`Delete ${event.event.title}`}
                accessibilityRole="button"
                onPress={() =>
                  confirmEventDeletion(event.event.title, () => {
                    void deleteEvent(event.event).catch(() => {
                      showToast({
                        message: 'The event was not deleted. Please try again.',
                        kind: 'error',
                      });
                    });
                  })
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
                <Trash2
                  color={colors.onDestructive}
                  size={19}
                  strokeWidth={2}
                />
                <Text
                  style={[styles.deleteText, { color: colors.onDestructive }]}
                >
                  Delete
                </Text>
              </Pressable>
            )
          }
        >
          <EventCardContent
            event={event}
            hasConflicts={hasConflicts}
            significance={significance}
            colors={colors}
            isDark={isDark}
            hasExpandableContent={hasExpandableContent}
            isExpanded={isExpanded}
            onLongPress={selectionMode ? undefined : startSelection}
            onOpen={openEvent}
            onToggleExpanded={
              selectionMode
                ? () => onSelect?.()
                : () => setIsExpanded((current) => !current)
            }
            onTitleOverflowChange={handleTitleOverflowChange}
          />
        </SwipeReveal>
      </View>
    </View>
  );
}
