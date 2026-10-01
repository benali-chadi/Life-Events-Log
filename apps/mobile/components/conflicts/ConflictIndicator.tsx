import { radius } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { GitCompareArrows } from 'lucide-react-native';
import { Pressable, StyleSheet } from 'react-native';

export default function ConflictIndicator({
  fieldLabel,
  onPress,
  disabled = false,
}: {
  fieldLabel: string;
  onPress(): void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Review conflicting ${fieldLabel.toLowerCase()}`}
      accessibilityHint="Compare the current and alternative values"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { opacity: disabled ? 0.5 : 1 },
        pressed && { backgroundColor: colors.warningMuted },
      ]}
    >
      <GitCompareArrows size={19} color={colors.warning} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
});
