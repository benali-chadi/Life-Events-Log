import { spacing, typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export const METADATA_SECTIONS = [
  { id: 'categories', label: 'Categories' },
  { id: 'tags', label: 'Tags' },
  { id: 'people', label: 'People' },
  { id: 'locations', label: 'Locations' },
] as const;

export type MetadataSectionId = (typeof METADATA_SECTIONS)[number]['id'];

type MetadataTabsProps = {
  value: MetadataSectionId;
  onChange: (value: MetadataSectionId) => void;
};

export default function MetadataTabs({ value, onChange }: MetadataTabsProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.root, { borderBottomColor: colors.border }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {METADATA_SECTIONS.map((section) => {
          const selected = section.id === value;

          return (
            <Pressable
              key={section.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onChange(section.id)}
              style={({ pressed }) => [
                styles.tab,
                pressed && { backgroundColor: colors.interactiveMuted },
              ]}
            >
              <Text
                style={[
                  styles.label,
                  {
                    color: selected ? colors.text : colors.textMuted,
                    fontWeight: selected ? '700' : '500',
                  },
                ]}
              >
                {section.label}
              </Text>
              <View
                style={[
                  styles.indicator,
                  {
                    backgroundColor: selected ? colors.primary : 'transparent',
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderBottomWidth: 1 },
  content: { flexGrow: 1 },
  tab: {
    minWidth: 88,
    minHeight: 48,
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  label: { ...typography.small },
  indicator: {
    position: 'absolute',
    right: spacing[3],
    bottom: -1,
    left: spacing[3],
    height: 2,
    borderRadius: 1,
  },
});
