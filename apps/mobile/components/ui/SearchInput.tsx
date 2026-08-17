import {
  ColorsTheme,
  controlSize,
  radius,
  spacing,
  typography,
} from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { Search, X } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef } from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  type StyleProp,
  Text,
  TextInput,
  TextInputProps,
  type ViewStyle,
} from 'react-native';

type InputProps = TextInputProps & {
  showClear?: boolean;
  clear?: () => void;
  blurOnKeyboardHide?: boolean;
  collapsedPreview?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

export default function SearchInput({
  showClear,
  clear,
  blurOnKeyboardHide = false,
  collapsedPreview,
  containerStyle,
  ...props
}: InputProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!blurOnKeyboardHide) return;

    const subscription = Keyboard.addListener('keyboardDidHide', () => {
      inputRef.current?.blur();
    });

    return () => subscription.remove();
  }, [blurOnKeyboardHide]);

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      style={[styles.searchContainer, containerStyle]}
    >
      <Search size={18} strokeWidth={2} color={colors.textMuted} />

      {collapsedPreview && (
        <Text numberOfLines={1} style={styles.collapsedPreview}>
          {collapsedPreview}
        </Text>
      )}

      <TextInput
        ref={inputRef}
        {...props}

        placeholderTextColor={colors.textMuted}
        selectionColor={colors.focus}
        style={[styles.searchInput, collapsedPreview && styles.collapsedInput]}
      />

      {showClear && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={spacing[2]}
          onPress={clear}
          style={({ pressed }) => [
            styles.inlineIconButton,
            pressed && styles.inlineIconButtonPressed,
          ]}
        >
          <X size={16} strokeWidth={2} color={colors.textMuted} />
        </Pressable>
      )}
    </Pressable>
  );
}

function createStyles(colors: ColorsTheme) {
  return StyleSheet.create({
    searchContainer: {
      height: controlSize.md,
      minWidth: 200,
      marginHorizontal: spacing[4],
      marginBottom: spacing[3],
      paddingHorizontal: spacing[3],
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[2],
    },
    searchInput: {
      flex: 1,
      paddingVertical: 0,
      ...typography.small,
      color: colors.text,
    },
    collapsedInput: {
      position: 'absolute',
      width: 1,
      height: 1,
      opacity: 0,
    },
    collapsedPreview: {
      flex: 1,
      ...typography.caption,
      color: colors.textSecondary,
    },

    inlineIconButton: {
      width: controlSize.sm,
      height: controlSize.sm,
      marginRight: -spacing[2],
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    inlineIconButtonPressed: { backgroundColor: colors.interactiveMuted },
  });
}
