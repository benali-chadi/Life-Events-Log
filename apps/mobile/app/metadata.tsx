import { useTheme } from '@lel/design/useTheme';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MetadataTabs, {
  type MetadataSectionId,
} from '@/components/metadata-management/MetadataTabs';
import MetadataUsageSection from '@/components/metadata-management/MetadataUsageSection';
import type { MetadataUsageOrder } from '@/components/metadata-management/MetadataUsageSection';
import MetadataDeletionProvider, {
  useMetadataDeletion,
} from '@/components/metadata-management/MetadataDeletionProvider';
import { closeOpenSwipe } from '@/components/ui/SwipeReveal';

const INITIAL_SEARCHES: Record<MetadataSectionId, string> = {
  categories: '',
  tags: '',
  people: '',
  locations: '',
};

function MetadataManagementContent() {
  const { colors } = useTheme();
  const { finalizePending } = useMetadataDeletion();
  const [section, setSection] = useState<MetadataSectionId>('categories');
  const [searches, setSearches] = useState(INITIAL_SEARCHES);
  const [usageOrder, setUsageOrder] = useState<MetadataUsageOrder>('most');

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <MetadataTabs
        value={section}
        onChange={(nextSection) => {
          if (nextSection === section) return;
          closeOpenSwipe();
          void finalizePending().then(() => setSection(nextSection));
        }}
      />

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

export default function MetadataManagement() {
  return (
    <MetadataDeletionProvider>
      <MetadataManagementContent />
    </MetadataDeletionProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
