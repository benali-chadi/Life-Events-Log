import { radius, spacing, typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Alert,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  useDeleteEventMutation,
  useDeleteManyEventsMutation,
  useRestoreEventMutation,
  useRestoreManyEventsMutation,
} from '@/data/query';
import type { UUID } from '@/models';

type DeletableEvent = {
  id: UUID;
  title: string;
};

type EventDeletionContextValue = {
  deleteEvent: (event: DeletableEvent) => Promise<void>;
  deleteEvents: (events: readonly DeletableEvent[]) => Promise<void>;
  isDeletingEvents: boolean;
};

const EventDeletionContext = createContext<EventDeletionContextValue | null>(
  null
);

const UNDO_WINDOW_MS = 5000;

export default function EventDeletionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const deleteEventMutation = useDeleteEventMutation();
  const deleteManyEventsMutation = useDeleteManyEventsMutation();
  const restoreEventMutation = useRestoreEventMutation();
  const restoreManyEventsMutation = useRestoreManyEventsMutation();
  const [pendingEvents, setPendingEvents] = useState<DeletableEvent[]>([]);
  const [reduceMotion, setReduceMotion] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoProgress = useRef(new Animated.Value(1)).current;

  const clearUndoTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    undoProgress.stopAnimation();
  }, [undoProgress]);

  useEffect(() => clearUndoTimer, [clearUndoTimer]);

  useEffect(() => {
    let isMounted = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((isEnabled) => {
      if (isMounted) setReduceMotion(isEnabled);
    });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion
    );

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  const deleteEvent = useCallback(
    async (event: DeletableEvent) => {
      await deleteEventMutation.mutateAsync(event.id);
      clearUndoTimer();
      setPendingEvents([event]);
      undoProgress.setValue(1);

      if (!reduceMotion) {
        Animated.timing(undoProgress, {
          toValue: 0,
          duration: UNDO_WINDOW_MS,
          useNativeDriver: false,
        }).start();
      }

      timerRef.current = setTimeout(() => {
        setPendingEvents([]);
        timerRef.current = null;
      }, UNDO_WINDOW_MS);
    },
    [clearUndoTimer, deleteEventMutation, reduceMotion, undoProgress]
  );

  const deleteEvents = useCallback(
    async (events: readonly DeletableEvent[]) => {
      if (events.length === 0) return;

      await deleteManyEventsMutation.mutateAsync(events.map(({ id }) => id));
      clearUndoTimer();
      setPendingEvents([...events]);
      undoProgress.setValue(1);

      if (!reduceMotion) {
        Animated.timing(undoProgress, {
          toValue: 0,
          duration: UNDO_WINDOW_MS,
          useNativeDriver: false,
        }).start();
      }

      timerRef.current = setTimeout(() => {
        setPendingEvents([]);
        timerRef.current = null;
      }, UNDO_WINDOW_MS);
    },
    [clearUndoTimer, deleteManyEventsMutation, reduceMotion, undoProgress]
  );

  const undo = async () => {
    if (pendingEvents.length === 0) return;

    clearUndoTimer();
    const eventsToRestore = pendingEvents;

    try {
      if (eventsToRestore.length === 1) {
        await restoreEventMutation.mutateAsync(eventsToRestore[0]!.id);
      } else {
        await restoreManyEventsMutation.mutateAsync(
          eventsToRestore.map(({ id }) => id)
        );
      }
      setPendingEvents([]);
    } catch {
      setPendingEvents([]);
      Alert.alert(
        eventsToRestore.length === 1
          ? 'Could not restore event'
          : 'Could not restore events',
        `The ${eventsToRestore.length === 1 ? 'event' : 'events'} could not be restored. Please try again.`
      );
    }
  };

  return (
    <EventDeletionContext.Provider
      value={{
        deleteEvent,
        deleteEvents,
        isDeletingEvents: deleteManyEventsMutation.isPending,
      }}
    >
      {children}

      {pendingEvents.length > 0 && (
        <View
          accessibilityLiveRegion="polite"
          style={[
            styles.toast,
            {
              backgroundColor: colors.bg,
              shadowColor: colors.text,
            },
          ]}
        >
          <Text
            numberOfLines={1}
            style={[styles.toastText, { color: colors.text }]}
          >
            {pendingEvents.length === 1
              ? 'Event deleted'
              : `${pendingEvents.length} events deleted`}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void undo()}
            style={({ pressed }) => [
              styles.undoButton,
              pressed && { opacity: 0.65 },
            ]}
          >
            <Text style={[styles.undoText, { color: colors.text }]}>Undo</Text>
          </Pressable>
          {!reduceMotion && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.undoProgress,
                {
                  backgroundColor: colors.textMuted,
                  width: undoProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          )}
        </View>
      )}
    </EventDeletionContext.Provider>
  );
}

export function useEventDeletion() {
  const context = useContext(EventDeletionContext);

  if (!context) {
    throw new Error(
      'useEventDeletion must be used inside EventDeletionProvider'
    );
  }

  return context;
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    right: spacing[4],
    bottom: spacing[6],
    left: spacing[4],
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing[4],
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  toastText: {
    ...typography.small,
    flex: 1,
    fontWeight: '600',
  },
  undoButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing[2],
  },
  undoText: {
    ...typography.small,
    fontWeight: '700',
  },
  undoProgress: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 3,
    borderBottomLeftRadius: radius.md,
    opacity: 0.55,
  },
});
