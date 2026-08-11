import { radius, spacing, typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { useNavigation } from 'expo-router';
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
  useDeleteCategoryMutation,
  useDeleteLocationMutation,
  useDeletePersonMutation,
  useDeleteTagMutation,
} from '@/data/query';
import type { UUID } from '@/models';
import { confirmMetadataDeletion } from './confirmMetadataDeletion';

export type MetadataDeletionKind = 'category' | 'tag' | 'person' | 'location';

export type PendingMetadataDeletion = {
  kind: MetadataDeletionKind;
  id: UUID;
  name: string;
  eventCount: number;
};

type MetadataDeletionContextValue = {
  pending: PendingMetadataDeletion | null;
  requestDeletion: (
    metadata: PendingMetadataDeletion,
    onConfirmed?: () => void
  ) => void;
  finalizePending: () => Promise<boolean>;
};

const MetadataDeletionContext =
  createContext<MetadataDeletionContextValue | null>(null);

const DELETE_DELAY_MS = 5000;

export default function MetadataDeletionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const deleteCategory = useDeleteCategoryMutation();
  const deleteTag = useDeleteTagMutation();
  const deletePerson = useDeletePersonMutation();
  const deleteLocation = useDeleteLocationMutation();
  const [pending, setPending] = useState<PendingMetadataDeletion | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const pendingRef = useRef<PendingMetadataDeletion | null>(null);
  const finalizingRef = useRef<Promise<boolean> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allowNavigationRef = useRef(false);
  const progress = useRef(new Animated.Value(1)).current;

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    progress.stopAnimation();
  }, [progress]);

  const setPendingMetadata = useCallback(
    (metadata: PendingMetadataDeletion | null) => {
      pendingRef.current = metadata;
      setPending(metadata);
    },
    []
  );

  const deleteMetadata = useCallback(
    (metadata: PendingMetadataDeletion) => {
      switch (metadata.kind) {
        case 'category':
          return deleteCategory.mutateAsync(metadata.id);
        case 'tag':
          return deleteTag.mutateAsync(metadata.id);
        case 'person':
          return deletePerson.mutateAsync(metadata.id);
        case 'location':
          return deleteLocation.mutateAsync(metadata.id);
      }
    },
    [deleteCategory, deleteLocation, deletePerson, deleteTag]
  );

  const finalizePending = useCallback(() => {
    if (finalizingRef.current) return finalizingRef.current;

    const metadata = pendingRef.current;
    if (!metadata) return Promise.resolve(true);

    clearTimer();
    setIsFinalizing(true);

    const operation = deleteMetadata(metadata)
      .then(() => {
        if (
          pendingRef.current?.kind === metadata.kind &&
          pendingRef.current.id === metadata.id
        ) {
          setPendingMetadata(null);
        }
        return true;
      })
      .catch(() => {
        setPendingMetadata(null);
        Alert.alert(
          `Could not delete ${metadata.kind}`,
          `“${metadata.name}” was not deleted. Please try again.`
        );
        return false;
      })
      .finally(() => {
        finalizingRef.current = null;
        setIsFinalizing(false);
      });

    finalizingRef.current = operation;
    return operation;
  }, [clearTimer, deleteMetadata, setPendingMetadata]);

  const startDelay = useCallback(
    (metadata: PendingMetadataDeletion) => {
      setPendingMetadata(metadata);
      progress.setValue(1);

      if (!reduceMotion) {
        Animated.timing(progress, {
          toValue: 0,
          duration: DELETE_DELAY_MS,
          useNativeDriver: false,
        }).start();
      }

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void finalizePending();
      }, DELETE_DELAY_MS);
    },
    [finalizePending, progress, reduceMotion, setPendingMetadata]
  );

  const requestDeletion = useCallback(
    (metadata: PendingMetadataDeletion, onConfirmed?: () => void) => {
      confirmMetadataDeletion(metadata, () => {
        onConfirmed?.();
        void (async () => {
          if (pendingRef.current) await finalizePending();
          startDelay(metadata);
        })();
      });
    },
    [finalizePending, startDelay]
  );

  const undo = () => {
    if (isFinalizing) return;
    clearTimer();
    setPendingMetadata(null);
  };

  useEffect(() => {
    let mounted = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (!pendingRef.current || allowNavigationRef.current) return;

        event.preventDefault();
        void finalizePending().then((deleted) => {
          if (!deleted) return;
          allowNavigationRef.current = true;
          navigation.dispatch(event.data.action);
        });
      }),
    [finalizePending, navigation]
  );

  return (
    <MetadataDeletionContext.Provider
      value={{ pending, requestDeletion, finalizePending }}
    >
      <View style={styles.providerRoot}>
        {children}

        {pending && (
          <View
            accessibilityLiveRegion="polite"
            style={[
              styles.toast,
              { backgroundColor: colors.bg, shadowColor: colors.text },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[styles.toastText, { color: colors.text }]}
            >
              {isFinalizing ? 'Deleting…' : `Delete “${pending.name}”?`}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={isFinalizing}
              onPress={undo}
              style={({ pressed }) => [
                styles.toastButton,
                pressed && styles.pressedButton,
              ]}
            >
              <Text style={[styles.toastAction, { color: colors.text }]}>
                Undo
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={isFinalizing}
              onPress={() => void finalizePending()}
              style={({ pressed }) => [
                styles.toastButton,
                pressed && styles.pressedButton,
              ]}
            >
              <Text style={[styles.toastAction, { color: colors.destructive }]}>
                Delete now
              </Text>
            </Pressable>
            {!reduceMotion && !isFinalizing && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.progress,
                  {
                    backgroundColor: colors.destructive,
                    width: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            )}
          </View>
        )}
      </View>
    </MetadataDeletionContext.Provider>
  );
}

export function useMetadataDeletion() {
  const context = useContext(MetadataDeletionContext);

  if (!context) {
    throw new Error(
      'useMetadataDeletion must be used inside MetadataDeletionProvider'
    );
  }

  return context;
}

const styles = StyleSheet.create({
  providerRoot: { flex: 1 },
  toast: {
    position: 'absolute',
    right: spacing[4],
    bottom: spacing[6],
    left: spacing[4],
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingLeft: spacing[4],
    paddingRight: spacing[2],
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  toastText: { ...typography.small, flex: 1, fontWeight: '600' },
  toastButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing[2],
  },
  toastAction: { ...typography.caption, fontWeight: '700' },
  pressedButton: { opacity: 0.65 },
  progress: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 3,
    borderBottomLeftRadius: radius.md,
    opacity: 0.65,
  },
});
