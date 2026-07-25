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
import { Pressable, StyleSheet, Text, View } from 'react-native';

type EventDeletionContextValue = {
  deletedTitles: Set<string>;
  deleteEvent: (title: string) => void;
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
  const [deletedTitles, setDeletedTitles] = useState(() => new Set<string>());
  const [pendingTitle, setPendingTitle] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearUndoTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => clearUndoTimer, [clearUndoTimer]);

  const deleteEvent = useCallback(
    (title: string) => {
      clearUndoTimer();
      setDeletedTitles((current) => new Set(current).add(title));
      setPendingTitle(title);
      timerRef.current = setTimeout(() => {
        setPendingTitle(null);
        timerRef.current = null;
      }, UNDO_WINDOW_MS);
    },
    [clearUndoTimer]
  );

  const undo = () => {
    if (!pendingTitle) return;

    clearUndoTimer();
    setDeletedTitles((current) => {
      const next = new Set(current);
      next.delete(pendingTitle);
      return next;
    });
    setPendingTitle(null);
  };

  return (
    <EventDeletionContext.Provider value={{ deletedTitles, deleteEvent }}>
      {children}

      {pendingTitle && (
        <View
          accessibilityLiveRegion="polite"
          style={[
            styles.toast,
            {
              backgroundColor: colors.text,
              shadowColor: colors.text,
            },
          ]}
        >
          <Text
            numberOfLines={1}
            style={[styles.toastText, { color: colors.bg }]}
          >
            Event deleted
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={undo}
            style={({ pressed }) => [
              styles.undoButton,
              pressed && { opacity: 0.65 },
            ]}
          >
            <Text style={[styles.undoText, { color: colors.bg }]}>Undo</Text>
          </Pressable>
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
});
