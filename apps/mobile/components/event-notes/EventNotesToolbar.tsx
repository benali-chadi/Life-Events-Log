import { radius, spacing } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import {
  Bold,
  Code,
  FileCode2,
  Italic,
  Link,
  List as BulletList,
  ListOrdered,
  Quote,
} from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { Selection } from './EventNotes';

interface EventNotesToolbarProps {
  value: string;
  selection: Selection;
  updateValueAndSelection: (
    nextValue: string,
    nextSelection: Selection
  ) => void;
}

export default function EventNotesToolbar({
  value,
  selection,
  updateValueAndSelection,
}: EventNotesToolbarProps) {
  const { colors } = useTheme();

  const wrapSelection = (
    opening: string,
    closing: string,
    placeholder: string
  ) => {
    const selectedText = value.slice(selection.start, selection.end);
    const content = selectedText || placeholder;
    const replacement = `${opening}${content}${closing}`;
    const nextValue =
      value.slice(0, selection.start) +
      replacement +
      value.slice(selection.end);
    const contentStart = selection.start + opening.length;

    updateValueAndSelection(nextValue, {
      start: contentStart,
      end: contentStart + content.length,
    });
  };

  const prefixSelectedLines = (getPrefix: (lineIndex: number) => string) => {
    const lineStart = value.lastIndexOf('\n', selection.start - 1) + 1;
    const nextLineBreak = value.indexOf('\n', selection.end);
    const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
    const selectedLines = value.slice(lineStart, lineEnd).split('\n');
    const replacement = selectedLines
      .map((line, index) => `${getPrefix(index)}${line}`)
      .join('\n');
    const nextValue =
      value.slice(0, lineStart) + replacement + value.slice(lineEnd);

    updateValueAndSelection(nextValue, {
      start: lineStart,
      end: lineStart + replacement.length,
    });
  };

  const insertLink = () => {
    const selectedText = value.slice(selection.start, selection.end);
    const label = selectedText || 'link text';
    const url = 'https://';
    const replacement = `[${label}](${url})`;
    const nextValue =
      value.slice(0, selection.start) +
      replacement +
      value.slice(selection.end);
    const selectionStart = selectedText
      ? selection.start + label.length + 3
      : selection.start + 1;
    const selectionLength = selectedText ? url.length : label.length;

    updateValueAndSelection(nextValue, {
      start: selectionStart,
      end: selectionStart + selectionLength,
    });
  };

  const toolbarActions = [
    {
      label: 'Bold',
      icon: Bold,
      onPress: () => wrapSelection('**', '**', 'bold text'),
    },
    {
      label: 'Italic',
      icon: Italic,
      onPress: () => wrapSelection('*', '*', 'italic text'),
    },
    {
      label: 'Block quote',
      icon: Quote,
      onPress: () => prefixSelectedLines(() => '> '),
    },
    {
      label: 'Inline code',
      icon: Code,
      onPress: () => wrapSelection('`', '`', 'code'),
    },
    {
      label: 'Code block',
      icon: FileCode2,
      onPress: () => wrapSelection('```\n', '\n```', 'code'),
    },
    {
      label: 'Link',
      icon: Link,
      onPress: insertLink,
    },
    {
      label: 'Bulleted list',
      icon: BulletList,
      onPress: () => prefixSelectedLines(() => '- '),
    },
    {
      label: 'Numbered list',
      icon: ListOrdered,
      onPress: () => prefixSelectedLines((index) => `${index + 1}. `),
    },
  ];

  return (
    <ScrollView
      horizontal
      contentContainerStyle={styles.toolbarContent}
      keyboardShouldPersistTaps="always"
      showsHorizontalScrollIndicator={false}
      style={[
        styles.toolbar,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      {toolbarActions.map((action) => {
        const Icon = action.icon;

        return (
          <Pressable
            key={action.label}
            accessibilityLabel={action.label}
            accessibilityRole="button"
            hitSlop={4}
            onPress={action.onPress}
            style={({ pressed }) => [
              styles.toolbarButton,
              pressed && { backgroundColor: colors.interactivePressed },
            ]}
          >
            <Icon color={colors.textSecondary} size={18} strokeWidth={2} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexGrow: 0,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  toolbarContent: {
    alignItems: 'center',
    gap: spacing[1],
    padding: spacing[1],
  },
  toolbarButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
});
