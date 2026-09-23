import { radius, spacing, typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ExportPhase } from '@/data/sqlite/sync/export';

export type SyncExportViewState = {
  phase: ExportPhase;
  completed?: number;
  total?: number;
  cancellable: boolean;
};

export default function SyncExportProgressModal({
  progress,
  error,
  onCancel,
  onRetry,
  onClose,
}: {
  progress: SyncExportViewState | null;
  error: string | null;
  onCancel: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const visible = progress !== null || error !== null;
  const title = error
    ? 'Couldn’t export sync package'
    : progress?.phase === 'compressing'
      ? 'Packaging…'
      : progress?.phase === 'operations'
        ? 'Exporting operations…'
        : progress?.phase === 'blobs'
          ? 'Copying attachments…'
          : 'Preparing sync package…';
  const count =
    progress?.phase === 'operations' && progress.completed !== undefined
      ? `${progress.completed.toLocaleString()} operations exported`
      : progress?.phase === 'blobs' &&
          progress.completed !== undefined &&
          progress.total !== undefined
        ? `${progress.completed.toLocaleString()} / ${progress.total.toLocaleString()} attachments checked`
        : null;
  return (
    <Modal
      animationType="fade"
      onRequestClose={() => {
        if (error) onClose();
        else if (progress?.cancellable) onCancel();
      }}
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <View
          accessibilityViewIsModal
          style={[styles.card, { backgroundColor: colors.surfaceElevated }]}
        >
          {!error && <ActivityIndicator color={colors.primary} size="large" />}
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.description, { color: colors.textMuted }]}>
            {error ??
              count ??
              'Includes your full sync history and available attachments, regardless of timeline filters.'}
          </Text>
          {error ? (
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={onClose}
                style={styles.action}
              >
                <Text
                  style={[styles.actionText, { color: colors.textSecondary }]}
                >
                  Close
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={onRetry}
                style={styles.action}
              >
                <Text style={[styles.actionText, { color: colors.primary }]}>
                  Retry
                </Text>
              </Pressable>
            </View>
          ) : progress?.cancellable ? (
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              style={styles.action}
            >
              <Text style={[styles.actionText, { color: colors.primary }]}>
                Cancel
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    padding: spacing[5],
  },
  card: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    gap: spacing[4],
    borderRadius: radius.lg,
    padding: spacing[5],
  },
  title: { ...typography.h3, textAlign: 'center' },
  description: { ...typography.body, textAlign: 'center' },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignSelf: 'stretch',
    gap: spacing[3],
  },
  action: {
    minHeight: 44,
    minWidth: 72,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionText: { ...typography.body, fontWeight: '600' },
});
