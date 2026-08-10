import { spacing, typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { Tags } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

export default function MetadataManagement() {
  const { colors } = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Tags color={colors.textMuted} size={28} strokeWidth={1.75} />
      <Text style={[styles.title, { color: colors.text }]}>
        Manage metadata
      </Text>
      <Text style={[styles.description, { color: colors.textMuted }]}>
        Categories, tags, people, and locations will be managed here.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[6],
  },
  title: { ...typography.h3, textAlign: 'center' },
  description: { ...typography.small, textAlign: 'center' },
});
