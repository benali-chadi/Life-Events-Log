import { spacing, typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MetadataTabs, {
  METADATA_SECTIONS,
  type MetadataSectionId,
} from '@/components/metadata-management/MetadataTabs';

export default function MetadataManagement() {
  const { colors } = useTheme();
  const [section, setSection] = useState<MetadataSectionId>('categories');
  const activeSection = METADATA_SECTIONS.find((item) => item.id === section)!;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <MetadataTabs value={section} onChange={setSection} />

      <View style={styles.section}>
        <Text style={[styles.title, { color: colors.text }]}>
          {activeSection.label}
        </Text>
        <Text style={[styles.description, { color: colors.textMuted }]}>
          {activeSection.label} will appear here.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  section: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[6],
  },
  title: { ...typography.h3, textAlign: 'center' },
  description: { ...typography.small, textAlign: 'center' },
});
