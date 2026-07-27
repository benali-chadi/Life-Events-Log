import { spacing, typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type MetadataRowProps = {
  children: ReactNode;
  icon: ReactNode;
  label: string;
};

export default function MetadataRow({
  children,
  icon,
  label,
}: MetadataRowProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <View style={styles.icon}>{icon}</View>
      <View style={styles.content}>
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        <View style={styles.control}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingVertical: spacing[1],
  },
  icon: {
    width: 30,
    alignItems: 'center',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    width: 104,
    ...typography.small,
    fontWeight: '600',
  },
  control: {
    flex: 1,
  },
});
