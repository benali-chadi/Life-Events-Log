import { elevation, radius, spacing, typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type AppToastKind = 'default' | 'error';
export type AppToastDismissReason =
  'timeout' | 'action' | 'replaced' | 'programmatic';

export type AppToastAction = {
  label: string;
  tone?: 'default' | 'destructive';
  onPress: () => unknown | Promise<unknown>;
};

export type AppToastOptions = {
  message: string;
  kind?: AppToastKind;
  /** Set to null to keep the toast visible until an action or explicit dismissal. */
  duration?: number | null;
  actions?: readonly AppToastAction[];
  showProgress?: boolean;
  onDismiss?: (reason: AppToastDismissReason) => void;
};

type VisibleToast = Required<Pick<AppToastOptions, 'message' | 'kind'>> &
  Omit<AppToastOptions, 'message' | 'kind'> & { id: number };

type AppToastContextValue = {
  showToast: (options: AppToastOptions) => number;
  dismissToast: (toastId?: number) => void;
};

const AppToastContext = createContext<AppToastContextValue | null>(null);
const DEFAULT_TOAST_DURATION_MS = 5000;

export default function AppToastProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<VisibleToast | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const toastRef = useRef<VisibleToast | null>(null);
  const nextId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progress = useRef(new Animated.Value(1)).current;

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    progress.stopAnimation();
  }, [progress]);

  const dismiss = useCallback(
    (toastId?: number, reason: AppToastDismissReason = 'programmatic') => {
      const current = toastRef.current;
      if (!current || (toastId !== undefined && current.id !== toastId)) return;

      clearTimer();
      toastRef.current = null;
      setToast(null);
      current.onDismiss?.(reason);
    },
    [clearTimer]
  );

  useEffect(() => clearTimer, [clearTimer]);

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

  const showToast = useCallback(
    (options: AppToastOptions) => {
      dismiss(undefined, 'replaced');

      const duration =
        options.duration === undefined
          ? DEFAULT_TOAST_DURATION_MS
          : options.duration;
      const next: VisibleToast = {
        ...options,
        id: nextId.current++,
        kind: options.kind ?? 'default',
        duration,
      };
      toastRef.current = next;
      setToast(next);
      progress.setValue(1);

      if (duration !== null) {
        if (next.showProgress && !reduceMotion) {
          Animated.timing(progress, {
            toValue: 0,
            duration,
            useNativeDriver: false,
          }).start();
        }
        timer.current = setTimeout(() => dismiss(next.id, 'timeout'), duration);
      }

      return next.id;
    },
    [dismiss, progress, reduceMotion]
  );

  const context = useMemo(
    () => ({ showToast, dismissToast: dismiss }),
    [dismiss, showToast]
  );

  return (
    <AppToastContext.Provider value={context}>
      {children}
      {toast && (
        <View
          accessibilityLiveRegion={
            toast.kind === 'error' ? 'assertive' : 'polite'
          }
          style={[
            styles.toast,
            elevation.dropdown,
            {
              backgroundColor:
                toast.kind === 'error'
                  ? colors.destructiveMuted
                  : colors.surfaceElevated,
              borderColor:
                toast.kind === 'error' ? colors.destructive : colors.border,
              bottom: insets.bottom + spacing[4],
              shadowColor: colors.text,
            },
          ]}
        >
          <Text
            numberOfLines={2}
            style={[styles.message, { color: colors.text }]}
          >
            {toast.message}
          </Text>
          {toast.actions?.map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              onPress={() => {
                dismiss(toast.id, 'action');
                void action.onPress();
              }}
              style={({ pressed }) => [
                styles.actionButton,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.actionText,
                  {
                    color:
                      action.tone === 'destructive'
                        ? colors.destructive
                        : colors.text,
                  },
                ]}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
          {toast.showProgress && toast.duration !== null && !reduceMotion && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.progress,
                {
                  backgroundColor:
                    toast.kind === 'error'
                      ? colors.destructive
                      : colors.textMuted,
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
    </AppToastContext.Provider>
  );
}

export function useAppToast() {
  const context = useContext(AppToastContext);
  if (!context) {
    throw new Error('useAppToast must be used inside AppToastProvider.');
  }
  return context;
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    right: spacing[4],
    left: spacing[4],
    zIndex: 1000,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingLeft: spacing[4],
    paddingRight: spacing[2],
    paddingVertical: spacing[1],
  },
  message: {
    ...typography.small,
    flex: 1,
    fontWeight: '600',
    paddingVertical: spacing[2],
  },
  actionButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing[2],
  },
  actionText: { ...typography.caption, fontWeight: '700' },
  pressed: { opacity: 0.65 },
  progress: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 3,
    borderBottomLeftRadius: radius.md,
    opacity: 0.55,
  },
});
