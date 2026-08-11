import {
  controlSize,
  elevation,
  overlay,
  radius,
  spacing,
  typography,
} from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
type NamedMetadataEditSheetProps = {
  entityLabel: string;
  initialName: string;
  isSaving: boolean;
  error: string | null;
  onCancel: () => void;
  onDelete: () => void;
  onSave: (name: string) => void;
};

export default function NamedMetadataEditSheet({
  entityLabel,
  initialName,
  isSaving,
  error,
  onCancel,
  onDelete,
  onSave,
}: NamedMetadataEditSheetProps) {
  const { colors } = useTheme();
  const [name, setName] = useState(initialName);
  const normalizedName = name.trim();
  const canSave =
    Boolean(normalizedName) &&
    normalizedName.replace(/\s+/g, ' ') !==
      initialName.trim().replace(/\s+/g, ' ');

  const cancel = () => {
    if (!isSaving) onCancel();
  };

  const save = () => {
    if (canSave && !isSaving) onSave(normalizedName);
  };

  return (
    <Modal
      animationType="fade"
      onRequestClose={cancel}
      statusBarTranslucent
      transparent
      visible
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalRoot}
      >
        <Pressable
          accessibilityLabel={`Cancel ${entityLabel.toLowerCase()} editing`}
          accessibilityRole="button"
          onPress={cancel}
          style={styles.backdrop}
        />

        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            elevation.dropdown,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
              shadowColor: colors.text,
            },
          ]}
        >
          <View
            style={[styles.handle, { backgroundColor: colors.borderStrong }]}
          />
          <Text style={[styles.title, { color: colors.text }]}>
            Edit {entityLabel.toLowerCase()}
          </Text>

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Name
          </Text>
          <TextInput
            accessibilityLabel={`${entityLabel} name`}
            autoCapitalize="sentences"
            autoCorrect
            editable={!isSaving}
            onChangeText={setName}
            onSubmitEditing={save}
            placeholder={`${entityLabel} name`}
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
            selectionColor={colors.focus}
            style={[
              styles.nameInput,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            value={name}
          />

          {error && (
            <Text
              accessibilityRole="alert"
              style={[styles.error, { color: colors.destructive }]}
            >
              {error}
            </Text>
          )}

          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              disabled={isSaving}
              onPress={onDelete}
              style={({ pressed }) => [
                styles.deleteButton,
                pressed && { backgroundColor: colors.destructiveMuted },
              ]}
            >
              <Trash2 color={colors.destructive} size={17} strokeWidth={2} />
              <Text style={[styles.deleteText, { color: colors.destructive }]}>
                Delete
              </Text>
            </Pressable>

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                disabled={isSaving}
                onPress={cancel}
                style={({ pressed }) => [
                  styles.button,
                  { borderColor: colors.border },
                  pressed && { backgroundColor: colors.interactiveMuted },
                ]}
              >
                <Text
                  style={[styles.buttonText, { color: colors.textSecondary }]}
                >
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={!canSave || isSaving}
                onPress={save}
                style={({ pressed }) => [
                  styles.button,
                  styles.saveButton,
                  { backgroundColor: colors.primary },
                  pressed && { backgroundColor: colors.primaryPressed },
                  (!canSave || isSaving) && styles.disabledButton,
                ]}
              >
                {isSaving ? (
                  <ActivityIndicator color={colors.onPrimary} size="small" />
                ) : (
                  <Text
                    style={[styles.buttonText, { color: colors.onPrimary }]}
                  >
                    Save
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: overlay.backdrop,
  },
  sheet: {
    width: '100%',
    maxWidth: 560,
    padding: spacing[4],
    paddingBottom: spacing[6],
    borderWidth: 1,
    borderBottomWidth: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  handle: {
    alignSelf: 'center',
    width: spacing[10],
    height: spacing[1],
    marginBottom: spacing[3],
    borderRadius: radius.sm,
  },
  title: { ...typography.h3, marginBottom: spacing[4] },
  label: { ...typography.caption, marginBottom: spacing[2] },
  nameInput: {
    minHeight: controlSize.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderWidth: 1,
    borderRadius: radius.md,
    ...typography.body,
  },
  error: { ...typography.small, marginTop: spacing[3] },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
    marginTop: spacing[5],
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing[2],
  },
  deleteButton: {
    minHeight: controlSize.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[2],
    borderRadius: radius.md,
  },
  deleteText: { ...typography.small, fontWeight: '600' },
  button: {
    minWidth: 92,
    minHeight: controlSize.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
    borderWidth: 1,
    borderRadius: radius.md,
  },
  saveButton: { borderColor: 'transparent' },
  disabledButton: { opacity: 0.5 },
  buttonText: { ...typography.small, fontWeight: '600' },
});
