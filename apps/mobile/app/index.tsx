import { radius, spacing, typography } from '@lel/design';
import React from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import EventCard from '@/components/event-card';
import { useTheme } from '@lel/design/useTheme';
import { eventSections } from 'constants/events';
import { Plus } from 'lucide-react-native';
import { router } from 'expo-router';
import { useEventDeletion } from '@/components/event-deletion/EventDeletionProvider';
import { closeOpenSwipe } from '@/components/ui/SwipeReveal';

export default function Index() {
  const { colors } = useTheme();
  const { deletedTitles } = useEventDeletion();
  const visibleSections = eventSections
    .map((section) => ({
      ...section,
      data: section.data.filter((event) => !deletedTitles.has(event.title)),
    }))
    .filter((section) => section.data.length > 0);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <SectionList
        sections={visibleSections}
        contentContainerStyle={styles.listContent}
        keyExtractor={(item, index) => item.title + index}
        renderItem={({ item }) => <EventCard event={item} />}
        onScrollBeginDrag={closeOpenSwipe}
        showsVerticalScrollIndicator={false}
        renderSectionHeader={({ section: { title } }) => (
          <View style={{ backgroundColor: colors.bg }}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {title}
            </Text>
          </View>
        )}
        style={styles.list}
        ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
        SectionSeparatorComponent={() => (
          <View style={styles.sectionSeparator} />
        )}
        stickySectionHeadersEnabled
      />
      <Pressable
        accessibilityLabel="Create event"
        accessibilityRole="button"
        onPress={() => router.push('/new')}
        style={({ pressed }) => [
          styles.createButton,
          {
            backgroundColor: pressed ? colors.interactivePressed : colors.text,
          },
        ]}
      >
        <Plus color={colors.bg} size={26} strokeWidth={2.25} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    height: '100%',
    gap: spacing[2],
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  list: {
    maxHeight: '95%',
  },
  listContent: {
    paddingBottom: 96,
  },
  sectionTitle: {
    ...typography.h3,
  },
  itemSeparator: {
    height: spacing[1],
  },
  sectionSeparator: {
    height: spacing[3],
  },
  createButton: {
    position: 'absolute',
    right: spacing[5],
    bottom: spacing[6],
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.xl,
  },
});
