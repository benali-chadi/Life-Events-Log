import { elevation, radius, spacing, typography } from '@lel/design';
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
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ToastKind = 'default' | 'error';
type Toast = { id: number; message: string; kind: ToastKind };
type AppToastContextValue = {
  showToast: (message: string, kind?: ToastKind) => void;
};

const AppToastContext = createContext<AppToastContextValue | null>(null);
const TOAST_DURATION_MS = 5000;

export default function AppToastProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<Toast | null>(null);
  const nextId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const showToast = useCallback(
    (message: string, kind: ToastKind = 'default') => {
      clearTimer();
      const next = { id: nextId.current++, message, kind };
      setToast(next);
      timer.current = setTimeout(() => {
        setToast((current) => (current?.id === next.id ? null : current));
        timer.current = null;
      }, TOAST_DURATION_MS);
    },
    [clearTimer]
  );

  return (
    <AppToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <View
          accessibilityLiveRegion="assertive"
          pointerEvents="none"
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
          <Text style={[styles.message, { color: colors.text }]}>
            {toast.message}
          </Text>
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
    minHeight: 52,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  message: { ...typography.small, fontWeight: '600' },
});
