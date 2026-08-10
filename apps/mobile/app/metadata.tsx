import { useTheme } from '@lel/design/useTheme';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MetadataTabs, {
  type MetadataSectionId,
} from '@/components/metadata-management/MetadataTabs';
import MetadataUsageSection from '@/components/metadata-management/MetadataUsageSection';
import type { MetadataUsageOrder } from '@/components/metadata-management/MetadataUsageSection';

const INITIAL_SEARCHES: Record<MetadataSectionId, string> = {
  categories: '',
  tags: '',
  people: '',
  locations: '',
};

export default function MetadataManagement() {
  const { colors } = useTheme();
  const [section, setSection] = useState<MetadataSectionId>('categories');
  const [searches, setSearches] = useState(INITIAL_SEARCHES);
  const [usageOrder, setUsageOrder] = useState<MetadataUsageOrder>('most');

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <MetadataTabs value={section} onChange={setSection} />

      <MetadataUsageSection
        section={section}
        search={searches[section]}
        usageOrder={usageOrder}
        onUsageOrderChange={setUsageOrder}
        onSearchChange={(search) =>
          setSearches((current) => ({ ...current, [section]: search }))
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
