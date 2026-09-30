import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { eventColors, radius, spacing, typography } from '@lel/design';
import { CATEGORY_COLOR_VALUES, type CategoryColor } from '@/models';
import { useTheme } from '@lel/design/useTheme';
import BottomSheetModal from '@/components/ui/BottomSheetModal';
import { useAppToast } from '@/components/ui/AppToastProvider';
import { useResolveConflictMutation } from '@/data/query/useConflictQueries';
import type {
  ConflictChoice,
  FieldConflict,
  ResolveConflictResult,
} from '@/data/sqlite/sync/conflicts/createConflictService';
import {
  conflictFieldLabel,
  formatConflictValue,
} from './conflictPresentation';

export default function ConflictResolutionSheet({
  conflict,
  onClose,
  onResolved,
  entityLabel,
}: {
  conflict: FieldConflict;
  onClose(): void;
  onResolved(choice: ConflictChoice, result: ResolveConflictResult): void;
  entityLabel?: string;
}) {
  const { colors, isDark } = useTheme();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { showToast } = useAppToast();
  const resolution = useResolveConflictMutation();
  const saving = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const label = conflictFieldLabel(conflict.fieldName);
  const close = () => {
    if (!saving.current) onClose();
  };
  const choose = async (choice: ConflictChoice) => {
    if (saving.current) return;
    saving.current = true;
    setError(null);
    try {
      const result = await resolution.mutateAsync({
        conflictId: conflict.conflictId,
        choice,
      });
      onResolved(choice, result);
      onClose();
      if (result.status === 'already-resolved')
        showToast({ message: 'Already resolved' });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Couldn’t resolve this conflict. Please try again.'
      );
    } finally {
      saving.current = false;
    }
  };
  return (
    <BottomSheetModal
      closeAccessibilityLabel="Close conflict review"
      onRequestClose={close}
      sheetStyle={[
        styles.sheet,
        {
          maxHeight: height * 0.85,
          paddingBottom: Math.max(insets.bottom, spacing[4]),
        },
      ]}
    >
      <Text
        accessibilityRole="header"
        style={[styles.heading, { color: colors.text }]}
      >
        Review conflicting {label.toLowerCase()}
      </Text>
      {entityLabel && (
        <Text style={[styles.description, { color: colors.text }]}>
          {entityLabel}
        </Text>
      )}
      <Text style={[styles.description, { color: colors.textSecondary }]}>
        Choose which value to keep for this field.
      </Text>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.values}>
        {(['current', 'alternative'] as const).map((choice) => (
          <View
            key={choice}
            style={[
              styles.card,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text
              accessibilityRole="header"
              style={[styles.valueLabel, { color: colors.textSecondary }]}
            >
              {choice === 'current' ? 'Current value' : 'Alternative value'}
            </Text>
            {conflict.entityType === 'category' &&
              conflict.fieldName === 'color' &&
              (() => {
                const value =
                  choice === 'current'
                    ? conflict.currentValue
                    : conflict.alternativeValue;
                return value &&
                  CATEGORY_COLOR_VALUES.includes(value as CategoryColor) ? (
                  <View
                    accessibilityLabel={`${formatConflictValue('color', value)} color swatch`}
                    style={[
                      styles.swatch,
                      {
                        backgroundColor:
                          eventColors[value as CategoryColor][
                            isDark ? 'dark' : 'light'
                          ],
                        borderColor: colors.borderStrong,
                      },
                    ]}
                  />
                ) : null;
              })()}
            <Text selectable style={[styles.value, { color: colors.text }]}>
              {formatConflictValue(
                conflict.fieldName,
                choice === 'current'
                  ? conflict.currentValue
                  : conflict.alternativeValue
              )}
            </Text>
          </View>
        ))}
      </ScrollView>
      {error && (
        <Text
          accessibilityRole="alert"
          style={[styles.error, { color: colors.destructive }]}
        >
          {error}
        </Text>
      )}
      {resolution.isPending && (
        <View style={styles.saving}>
          <ActivityIndicator color={colors.primary} />
          <Text
            accessibilityLiveRegion="polite"
            style={{ color: colors.textSecondary }}
          >
            Resolving…
          </Text>
        </View>
      )}
      <View style={styles.actions}>
        {(['current', 'alternative'] as const).map((choice) => (
          <Pressable
            key={choice}
            accessibilityRole="button"
            accessibilityState={{ disabled: resolution.isPending }}
            disabled={resolution.isPending}
            onPress={() => void choose(choice)}
            style={({ pressed }) => [
              styles.button,
              {
                borderColor: colors.border,
                opacity: resolution.isPending ? 0.5 : 1,
              },
              pressed && { backgroundColor: colors.interactivePressed },
            ]}
          >
            <Text style={[styles.buttonText, { color: colors.text }]}>
              {choice === 'current' ? 'Keep current' : 'Use alternative'}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={resolution.isPending}
        onPress={close}
        style={styles.close}
      >
        <Text style={[styles.buttonText, { color: colors.textSecondary }]}>
          Close
        </Text>
      </Pressable>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  swatch: { width: 40, height: 40, borderRadius: radius.sm, borderWidth: 1 },
  sheet: { padding: spacing[4] },
  heading: { ...typography.h3 },
  description: { ...typography.small, marginVertical: spacing[2] },
  scroll: { flexShrink: 1 },
  values: { gap: spacing[3], paddingVertical: spacing[2] },
  card: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing[3],
    gap: spacing[2],
  },
  valueLabel: { ...typography.small, fontWeight: '600' },
  value: { ...typography.body },
  error: { ...typography.small, marginTop: spacing[2] },
  saving: {
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'center',
    paddingTop: spacing[2],
  },
  actions: { gap: spacing[2], marginTop: spacing[3] },
  button: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing[3],
    alignItems: 'center',
  },
  buttonText: { ...typography.small, fontWeight: '600' },
  close: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
