import { radius, spacing, typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import EventNotesToolbar from './EventNotesToolbar';

type EventNotesProps = {
  value: string;
  onChange: (value: string) => void;
  onEditingComplete: () => void;
};

export type Selection = {
  start: number;
  end: number;
};

export default function EventNotes({
  value,
  onChange,
  onEditingComplete,
}: EventNotesProps) {
  const { colors } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const inputRef = useRef<TextInput>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });

  const markdownStyles = useMemo(
    () => ({
      body: {
        ...typography.body,
        color: colors.textSecondary,
      },
      paragraph: {
        marginTop: 0,
        marginBottom: spacing[3],
      },
      strong: {
        color: colors.text,
        fontWeight: '700' as const,
      },
      em: {
        color: colors.textSecondary,
        fontStyle: 'italic' as const,
      },
      blockquote: {
        backgroundColor: colors.interactiveMuted,
        borderLeftColor: colors.borderStrong,
        borderLeftWidth: 3,
        paddingHorizontal: spacing[3],
        paddingVertical: spacing[2],
      },
      code_inline: {
        color: colors.text,
        backgroundColor: colors.interactiveMuted,
        borderColor: colors.border,
        paddingHorizontal: spacing[1],
      },
      code_block: {
        color: colors.textSecondary,
        backgroundColor: colors.interactiveMuted,
        borderColor: colors.border,
        borderRadius: radius.sm,
        padding: spacing[3],
      },
      fence: {
        color: colors.textSecondary,
        backgroundColor: colors.interactiveMuted,
        borderColor: colors.border,
        borderRadius: radius.sm,
        padding: spacing[3],
      },
      bullet_list: {
        marginBottom: spacing[3],
      },
      ordered_list: {
        marginBottom: spacing[3],
      },
      list_item: {
        marginBottom: spacing[1],
      },
      link: {
        color: colors.focus,
        textDecorationLine: 'underline' as const,
      },
    }),
    [colors]
  );

  const enterEditMode = () => {
    setIsEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const updateValueAndSelection = (
    nextValue: string,
    nextSelection: Selection
  ) => {
    onChange(nextValue);
    setSelection(nextSelection);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={[styles.heading, { color: colors.text }]}>Notes</Text>
        {isEditing ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Finish editing notes"
            onPress={() => {
              setIsEditing(false);
              inputRef.current?.blur();
              onEditingComplete();
            }}
            style={({ pressed }) => [
              styles.modeButton,
              pressed && { backgroundColor: colors.interactivePressed },
            ]}
          >
            <Text style={[styles.modeButtonText, { color: colors.text }]}>
              Done
            </Text>
          </Pressable>
        ) : (
          value.trim().length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit notes"
              onPress={enterEditMode}
              style={({ pressed }) => [
                styles.modeButton,
                pressed && { backgroundColor: colors.interactivePressed },
              ]}
            >
              <Text
                style={[styles.modeButtonText, { color: colors.textSecondary }]}
              >
                Edit
              </Text>
            </Pressable>
          )
        )}
      </View>

      {isEditing ? (
        <>
          <EventNotesToolbar
            value={value}
            selection={selection}
            updateValueAndSelection={updateValueAndSelection}
          />

          <TextInput
            ref={inputRef}
            accessibilityLabel="Event notes in Markdown"
            multiline
            onChangeText={onChange}
            onSelectionChange={(event) =>
              setSelection(event.nativeEvent.selection)
            }
            placeholder="Write something about this event…"
            placeholderTextColor={colors.textMuted}
            selection={selection}
            selectionColor={colors.focus}
            style={[
              styles.editor,
              {
                maxHeight: Math.max(260, windowHeight * 0.5),
                color: colors.text,
                backgroundColor: colors.surface,
                borderColor: colors.focus,
              },
            ]}
            scrollEnabled
            textAlignVertical="top"
            value={value}
          />
        </>
      ) : value.trim().length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit event notes"
          onPress={enterEditMode}
          style={({ pressed }) => [
            styles.markdownSurface,
            pressed && { backgroundColor: colors.interactiveMuted },
          ]}
        >
          <Markdown style={markdownStyles}>{value}</Markdown>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add notes"
          onPress={enterEditMode}
          style={({ pressed }) => [
            styles.emptyState,
            { borderColor: colors.border },
            pressed && { backgroundColor: colors.interactiveMuted },
          ]}
        >
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            Add notes…
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing[2],
  },
  header: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: {
    ...typography.h3,
  },
  modeButton: {
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: radius.sm,
    paddingHorizontal: spacing[2],
  },
  modeButtonText: {
    ...typography.small,
    fontWeight: '600',
  },
  editor: {
    ...typography.body,
    minHeight: 260,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing[3],
  },
  markdownSurface: {
    minHeight: 120,
    borderRadius: radius.md,
    padding: spacing[2],
  },
  emptyState: {
    minHeight: 160,
    justifyContent: 'flex-start',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    padding: spacing[3],
  },
  emptyText: {
    ...typography.body,
  },
});
