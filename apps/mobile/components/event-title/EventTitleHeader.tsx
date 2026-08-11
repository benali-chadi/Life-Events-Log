import { typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { StyleSheet, Text } from 'react-native';

type EventTitleHeaderProps = {
  title: string;
};

export default function EventTitleHeader({ title }: EventTitleHeaderProps) {
  const { colors } = useTheme();

  return (
    <Text
      accessibilityLabel={title}
      numberOfLines={1}
      style={[styles.title, { color: colors.text }]}
    >
      {title}
    </Text>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.body,
    maxWidth: '100%',
    fontWeight: '600',
    textAlign: 'center',
  },
});
