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
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

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
    (title: string) => {
      clearUndoTimer();
      setDeletedTitles((current) => new Set(current).add(title));
      setPendingTitle(title);
      undoProgress.setValue(1);

      if (!reduceMotion) {
        Animated.timing(undoProgress, {
          toValue: 0,
          duration: UNDO_WINDOW_MS,
          useNativeDriver: false,
        }).start();
      }

      timerRef.current = setTimeout(() => {
        setPendingTitle(null);
        timerRef.current = null;
      }, UNDO_WINDOW_MS);
    },
    [clearUndoTimer, reduceMotion, undoProgress]
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
              backgroundColor: colors.bg,
              shadowColor: colors.text,
            },
          ]}
        >
          <Text
            numberOfLines={1}
            style={[styles.toastText, { color: colors.text }]}
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
