import { radius, spacing, typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { RefObject } from 'react';
import { Pressable, StyleSheet, Text, TextInput } from 'react-native';

type EventTitleHeaderProps = {
  inputRef: RefObject<TextInput | null>;
  isEditing: boolean;
  title: string;
  onBeginEditing: () => void;
  onChange: (title: string) => void;
  onSubmit: () => void;
};

export default function EventTitleHeader({
  inputRef,
  isEditing,
  title,
  onBeginEditing,
  onChange,
  onSubmit,
}: EventTitleHeaderProps) {
  const { colors } = useTheme();

  if (isEditing) {
    return (
      <TextInput
        ref={inputRef}
        accessibilityLabel="Event title"
        autoCapitalize="sentences"
        autoCorrect
        enterKeyHint="done"
        maxLength={160}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        placeholder="Event title"
        placeholderTextColor={colors.textMuted}
        returnKeyType="done"
        selectTextOnFocus
        selectionColor={colors.focus}
        style={[
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: colors.focus,
          },
        ]}
        value={title}
      />
    );
  }

  return (
    <Pressable
      accessibilityHint="Edits the event title"
      accessibilityLabel={`${title}. Edit event title`}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onBeginEditing}
      style={({ pressed }) => [
        styles.titleButton,
        pressed && { backgroundColor: colors.interactiveMuted },
      ]}
    >
      <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  titleButton: {
    maxWidth: 240,
    borderRadius: radius.sm,
    paddingHorizontal: spacing[1],
    paddingVertical: 2,
  },
  title: {
    ...typography.body,
    fontWeight: '600',
    textAlign: 'center',
  },
  input: {
    width: '100%',
    height: '100%',
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing[2],
    ...typography.small,
  },
});
