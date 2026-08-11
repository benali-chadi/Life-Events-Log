import {
  controlSize,
  elevation,
  eventColors,
  overlay,
  radius,
  spacing,
  typography,
} from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CATEGORY_COLOR_VALUES, type CategoryColor } from '@/models';

type CategoryCreationSheetProps = {
  mode?: 'create' | 'edit';
  initialName: string;
  initialColor: CategoryColor;
  isCreating: boolean;
  error: string | null;
  onCancel: () => void;
  onCreate: (name: string, color: CategoryColor) => void;
};

function colorLabel(color: CategoryColor) {
  return color.charAt(0).toUpperCase() + color.slice(1);
}

export default function CategoryCreationSheet({
  mode = 'create',
  initialName,
  initialColor,
  isCreating,
  error,
  onCancel,
  onCreate,
}: CategoryCreationSheetProps) {
  const { colors, isDark } = useTheme();
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const normalizedName = name.trim();
  const hasChanges =
    normalizedName.replace(/\s+/g, ' ') !==
      initialName.trim().replace(/\s+/g, ' ') || color !== initialColor;
  const canSubmit =
    Boolean(normalizedName) && (mode === 'create' || hasChanges);
  const categoryColor = eventColors[color][isDark ? 'dark' : 'light'];

  const cancel = () => {
    if (!isCreating) onCancel();
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
          accessibilityLabel={`Cancel category ${mode === 'create' ? 'creation' : 'editing'}`}
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

          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.title, { color: colors.text }]}>
              {mode === 'create' ? 'New category' : 'Edit category'}
            </Text>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Name
              </Text>
              <TextInput
                accessibilityLabel="Category name"
                autoCapitalize="sentences"
                autoCorrect
                editable={!isCreating}
                onChangeText={setName}
                placeholder="Category name"
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
            </View>

            <View style={styles.field}>
              <View style={styles.colorHeading}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Color
                </Text>
                <Text
                  style={[styles.selectedColor, { color: colors.textMuted }]}
                >
                  {colorLabel(color)}
                </Text>
              </View>

              <View style={styles.colorGrid}>
                {CATEGORY_COLOR_VALUES.map((option) => {
                  const selected = option === color;
                  const swatchColor =
                    eventColors[option][isDark ? 'dark' : 'light'];

                  return (
                    <Pressable
                      key={option}
                      accessibilityLabel={colorLabel(option)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      disabled={isCreating}
                      onPress={() => setColor(option)}
                      style={({ pressed }) => [
                        styles.swatchButton,
                        {
                          borderColor: selected
                            ? colors.borderStrong
                            : 'transparent',
                          opacity: pressed ? 0.72 : 1,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.swatch,
                          { backgroundColor: swatchColor },
                        ]}
                      >
                        {selected && (
                          <Check
                            color={colors.surface}
                            size={18}
                            strokeWidth={3}
                          />
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Preview
              </Text>
              <View
                style={[
                  styles.preview,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderLeftColor: categoryColor,
                  },
                ]}
              >
                <Text style={[styles.previewTitle, { color: colors.text }]}>
                  Event title
                </Text>
                <Text
                  style={[styles.previewMetadata, { color: colors.textMuted }]}
                >
                  Category · {normalizedName || 'Category name'}
                </Text>
              </View>
            </View>

            {error && (
              <Text
                accessibilityRole="alert"
                style={[styles.error, { color: colors.destructive }]}
              >
                {error}
              </Text>
            )}

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                disabled={isCreating}
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
                disabled={!canSubmit || isCreating}
                onPress={() => onCreate(normalizedName, color)}
                style={({ pressed }) => [
                  styles.button,
                  styles.createButton,
                  { backgroundColor: colors.primary },
                  pressed && { backgroundColor: colors.primaryPressed },
                  (!canSubmit || isCreating) && styles.disabledButton,
                ]}
              >
                {isCreating ? (
                  <ActivityIndicator color={colors.onPrimary} size="small" />
                ) : (
                  <Text
                    style={[styles.buttonText, { color: colors.onPrimary }]}
                  >
                    {mode === 'create' ? 'Create' : 'Save'}
                  </Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
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
    maxHeight: '92%',
    paddingTop: spacing[2],
    borderWidth: 1,
    borderBottomWidth: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  handle: {
    alignSelf: 'center',
    width: spacing[10],
    height: spacing[1],
    marginBottom: spacing[2],
    borderRadius: radius.sm,
  },
  content: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[6],
  },
  title: { ...typography.h3, marginBottom: spacing[4] },
  field: { gap: spacing[2], marginBottom: spacing[4] },
  label: { ...typography.caption },
  nameInput: {
    minHeight: controlSize.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderWidth: 1,
    borderRadius: radius.md,
    ...typography.body,
  },
  colorHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedColor: { ...typography.caption },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    padding: spacing[2],
    borderRadius: radius.lg,
  },
  swatchButton: {
    width: 44,
    height: 44,
    padding: 3,
    borderWidth: 2,
    borderRadius: 22,
  },
  swatch: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  preview: {
    minHeight: 64,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: radius.md,
  },
  previewTitle: { ...typography.small, fontWeight: '600' },
  previewMetadata: { ...typography.caption, marginTop: spacing[1] },
  error: { ...typography.small, marginBottom: spacing[3] },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing[2],
  },
  button: {
    minWidth: 92,
    minHeight: controlSize.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
    borderWidth: 1,
    borderRadius: radius.md,
  },
  createButton: { borderColor: 'transparent' },
  disabledButton: { opacity: 0.5 },
  buttonText: { ...typography.small, fontWeight: '600' },
});
