import { radius, spacing, typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useAppToast } from '@/components/ui/AppToastProvider';
import EventNotesToolbar from './EventNotesToolbar';
import { getAllowedLink } from './linkValidation';
import type {
  MarkdownTransformation,
  TextSelection,
} from './markdownTransforms';
import { transformMarkdownListEnter } from './markdownTransforms';

type EventNotesProps = {
  committedValue: string;
  draftValue: string;
  onDraftChange: (value: string) => void;
  onSave: () => boolean | void | Promise<boolean | void>;
  onCancel: () => void;
};

export default function EventNotes({
  committedValue,
  draftValue,
  onDraftChange,
  onSave,
  onCancel,
}: EventNotesProps) {
  const { colors } = useTheme();
  const { showToast } = useAppToast();
  const { height: windowHeight } = useWindowDimensions();
  const inputRef = useRef<TextInput>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const selectionRef = useRef<TextSelection>({ start: 0, end: 0 });
  const [forcedSelection, setForcedSelection] = useState<TextSelection | null>(
    null
  );
  const [, setSelection] = useState<TextSelection>({
    start: 0,
    end: 0,
  });

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
    const endSelection = {
      start: draftValue.length,
      end: draftValue.length,
    };

    selectionRef.current = endSelection;
    setForcedSelection(endSelection);
    setSelection(endSelection);
    setIsEditing(true);
  };

  const applyTransformation = ({
    value,
    selection: nextSelection,
  }: MarkdownTransformation) => {
    selectionRef.current = nextSelection;
    setForcedSelection(nextSelection);
    setSelection(nextSelection);
    onDraftChange(value);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const openLink = useCallback(
    (value: string) => {
      const allowedLink = getAllowedLink(value);

      if (!allowedLink) {
        showToast({
          message: 'Links must use http, https, or mailto.',
          kind: 'error',
        });
        return false;
      }

      void Linking.openURL(allowedLink).catch(() => {
        showToast({
          message: 'This link could not be opened.',
          kind: 'error',
        });
      });

      return false;
    },
    [showToast]
  );

  const save = async () => {
    if (isSaving) return;

    setIsSaving(true);

    try {
      const saved = await onSave();

      if (saved === false) return;

      setIsEditing(false);
      inputRef.current?.blur();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={[styles.heading, { color: colors.text }]}>Notes</Text>
        {isEditing ? (
          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel notes editing"
              disabled={isSaving}
              onPress={() => {
                onCancel();
                setIsEditing(false);
                inputRef.current?.blur();
              }}
              style={({ pressed }) => [
                styles.modeButton,
                pressed && { backgroundColor: colors.interactivePressed },
              ]}
            >
              <Text
                style={[styles.modeButtonText, { color: colors.textSecondary }]}
              >
                Cancel
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save notes"
              disabled={isSaving}
              onPress={() => void save()}
              style={({ pressed }) => [
                styles.modeButton,
                isSaving && styles.disabledButton,
                pressed && { backgroundColor: colors.interactivePressed },
              ]}
            >
              <Text style={[styles.modeButtonText, { color: colors.primary }]}>
                Save
              </Text>
            </Pressable>
          </View>
        ) : (
          committedValue.trim().length > 0 && (
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
            value={draftValue}
            selection={selectionRef.current}
            applyTransformation={applyTransformation}
          />

          <TextInput
            ref={inputRef}
            accessibilityLabel="Event notes in Markdown"
            multiline
            onChangeText={(nextValue) => {
              const listTransformation = transformMarkdownListEnter(
                draftValue,
                nextValue,
                selectionRef.current
              );

              if (listTransformation) {
                applyTransformation(listTransformation);
                return;
              }

              onDraftChange(nextValue);
            }}
            onSelectionChange={(event) => {
              const nextSelection = event.nativeEvent.selection;

              selectionRef.current = nextSelection;
              setSelection(nextSelection);

              if (
                forcedSelection &&
                nextSelection.start === forcedSelection.start &&
                nextSelection.end === forcedSelection.end
              ) {
                setForcedSelection(null);
              }
            }}
            placeholder="Write something about this event…"
            placeholderTextColor={colors.textMuted}
            selection={forcedSelection ?? undefined}
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
            value={draftValue}
          />
        </>
      ) : committedValue.trim().length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit event notes"
          onPress={enterEditMode}
          style={({ pressed }) => [
            styles.markdownSurface,
            pressed && { backgroundColor: colors.interactiveMuted },
          ]}
        >
          <Markdown onLinkPress={openLink} style={markdownStyles}>
            {committedValue}
          </Markdown>
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
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
  disabledButton: {
    opacity: 0.5,
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
