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
import {
  hasLinePrefix,
  insertMarkdownLink,
  isWrapped,
  type MarkdownTransformation,
  type TextSelection,
  toggleLinePrefix,
  toggleWrappedText,
} from './markdownTransforms';

interface EventNotesToolbarProps {
  value: string;
  selection: TextSelection;
  applyTransformation: (transformation: MarkdownTransformation) => void;
}

export default function EventNotesToolbar({
  value,
  selection,
  applyTransformation,
}: EventNotesToolbarProps) {
  const { colors } = useTheme();

  const toolbarActions = [
    {
      label: 'Bold',
      icon: Bold,
      isActive: isWrapped(value, selection, '**', '**'),
      onPress: () =>
        applyTransformation(toggleWrappedText(value, selection, '**', '**')),
    },
    {
      label: 'Italic',
      icon: Italic,
      isActive: isWrapped(value, selection, '*', '*'),
      onPress: () =>
        applyTransformation(toggleWrappedText(value, selection, '*', '*')),
    },
    {
      label: 'Block quote',
      icon: Quote,
      isActive: hasLinePrefix(value, selection, 'blockquote'),
      onPress: () =>
        applyTransformation(toggleLinePrefix(value, selection, 'blockquote')),
    },
    {
      label: 'Inline code',
      icon: Code,
      isActive: isWrapped(value, selection, '`', '`'),
      onPress: () =>
        applyTransformation(toggleWrappedText(value, selection, '`', '`')),
    },
    {
      label: 'Code block',
      icon: FileCode2,
      isActive: isWrapped(value, selection, '```\n', '\n```'),
      onPress: () =>
        applyTransformation(
          toggleWrappedText(value, selection, '```\n', '\n```')
        ),
    },
    {
      label: 'Link',
      icon: Link,
      isActive: false,
      onPress: () => applyTransformation(insertMarkdownLink(value, selection)),
    },
    {
      label: 'Bulleted list',
      icon: BulletList,
      isActive: hasLinePrefix(value, selection, 'bullet-list'),
      onPress: () =>
        applyTransformation(toggleLinePrefix(value, selection, 'bullet-list')),
    },
    {
      label: 'Numbered list',
      icon: ListOrdered,
      isActive: hasLinePrefix(value, selection, 'numbered-list'),
      onPress: () =>
        applyTransformation(
          toggleLinePrefix(value, selection, 'numbered-list')
        ),
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
            accessibilityState={{ selected: action.isActive }}
            hitSlop={4}
            onPress={action.onPress}
            style={({ pressed }) => [
              styles.toolbarButton,
              action.isActive && {
                backgroundColor: colors.interactiveMuted,
              },
              pressed && { backgroundColor: colors.interactivePressed },
            ]}
          >
            <Icon
              color={action.isActive ? colors.text : colors.textSecondary}
              size={18}
              strokeWidth={2}
            />
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
