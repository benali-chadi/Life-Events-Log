import { EVENT_TITLE_MAX_LENGTH } from '@/models';
import { radius, spacing, typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { Pencil } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

type EventTitleEditorProps = {
  value: string;
  savedValue: string;
  isEditing: boolean;
  isSaving: boolean;
  onBeginEditing: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

export default function EventTitleEditor({
  value,
  savedValue,
  isEditing,
  isSaving,
  onBeginEditing,
  onChange,
  onSave,
  onCancel,
}: EventTitleEditorProps) {
  const { colors } = useTheme();
  const trimmedValue = value.trim();
  const isDirty = trimmedValue !== savedValue;

  if (!isEditing) {
    return (
      <Pressable
        accessibilityHint="Edits the event title"
        accessibilityLabel={`${savedValue}. Edit event title`}
        accessibilityRole="button"
        onPress={onBeginEditing}
        style={({ pressed }) => [
          styles.titleButton,
          pressed && { backgroundColor: colors.interactiveMuted },
        ]}
      >
        <Text numberOfLines={2} style={[styles.title, { color: colors.text }]}>
          {savedValue}
        </Text>
        <Pencil color={colors.textMuted} size={15} strokeWidth={2} />
      </Pressable>
    );
  }

  return (
    <View style={styles.editor}>
      <TextInput
        accessibilityLabel="Event title"
        autoCapitalize="sentences"
        autoCorrect
        autoFocus
        editable={!isSaving}
        maxLength={EVENT_TITLE_MAX_LENGTH}
        multiline
        onChangeText={onChange}
        placeholder="What happened?"
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.focus}
        style={[
          styles.input,
          {
            backgroundColor: colors.surface,
            borderColor: colors.focus,
            color: colors.text,
          },
        ]}
        value={value}
      />

      <View style={styles.editorFooter}>
        <Text style={[styles.counter, { color: colors.textMuted }]}>
          {value.length >= 80
            ? `${value.length}/${EVENT_TITLE_MAX_LENGTH}`
            : ''}
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={isSaving}
          onPress={onCancel}
          style={({ pressed }) => [
            styles.actionButton,
            pressed && { backgroundColor: colors.interactiveMuted },
          ]}
        >
          <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
            Cancel
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{
            disabled: !trimmedValue || !isDirty || isSaving,
          }}
          disabled={!trimmedValue || !isDirty || isSaving}
          onPress={onSave}
          style={({ pressed }) => [
            styles.actionButton,
            pressed && { backgroundColor: colors.interactiveMuted },
          ]}
        >
          <Text
            style={[
              styles.saveText,
              {
                color:
                  trimmedValue && isDirty && !isSaving
                    ? colors.primary
                    : colors.textMuted,
              },
            ]}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  titleButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    borderRadius: radius.md,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
  },
  title: {
    ...typography.h3,
    flex: 1,
  },
  editor: {
    gap: spacing[1],
  },
  input: {
    minHeight: 64,
    maxHeight: 112,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    textAlignVertical: 'top',
    ...typography.body,
  },
  editorFooter: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
  },
  counter: {
    ...typography.small,
    flex: 1,
  },
  actionButton: {
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: radius.sm,
    paddingHorizontal: spacing[3],
  },
  cancelText: {
    ...typography.small,
    fontWeight: '600',
  },
  saveText: {
    ...typography.small,
    fontWeight: '700',
  },
});
