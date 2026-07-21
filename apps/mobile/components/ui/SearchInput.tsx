import {
  ColorsTheme,
  controlSize,
  radius,
  spacing,
  typography,
} from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { Search, X } from 'lucide-react-native';
import React, { useMemo } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';

type InputProps = TextInputProps & {
  showClear?: boolean;
  clear?: () => void;
};

export default function SearchInput({
  showClear,
  clear,
  ...props
}: InputProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.searchContainer}>
      <Search size={18} strokeWidth={2} color={colors.textMuted} />

      <TextInput
        {...props}

        placeholderTextColor={colors.textMuted}
        selectionColor={colors.focus}
        style={styles.searchInput}
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
    </View>
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
