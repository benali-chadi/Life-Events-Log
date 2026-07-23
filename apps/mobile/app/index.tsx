import { spacing, typography } from '@lel/design';
import React from 'react';
import { SectionList, Text, View } from 'react-native';
import EventCard from '@/components/EventCard';
import { useTheme } from '@lel/design/useTheme';
import { eventSections } from 'constants/events';

export default function Index() {
  const { colors } = useTheme();

  return (
    <View
      style={{
        paddingHorizontal: 20,
        paddingTop: 10,
        gap: spacing[2],
        backgroundColor: colors.bg,
        height: '100%'
      }}
    >
      <SectionList
        sections={eventSections}
        keyExtractor={(item, index) => item.title + index}
        renderItem={({ item }) => <EventCard event={item} />}
        showsVerticalScrollIndicator={false}
        renderSectionHeader={({ section: { title } }) => (
          <View style={{ backgroundColor: colors.bg }}>
            <Text style={{ ...typography.h3, color: colors.text }}>
              {title}
            </Text>
          </View>
        )}
        style={{ maxHeight: '95%' }}
        ItemSeparatorComponent={() => (
          <View style={{ height: spacing[1] }}></View>
        )}
        SectionSeparatorComponent={() => (
          <View style={{ height: spacing[3] }}></View>
        )}
        stickySectionHeadersEnabled
      />
      {/* <FlatList
        data={[
          ...Array.from({ length: 30 }).fill({
            title: 'First Event',
            date: '3 weeks ago',
            categoryName: 'app',
            categoryColor: 'blue',
            tags: ['testing', 'app', 'ok'],
            people: ['mounir', 'issam', 'bilal'],
            location: 'Rabat',
          }),
          ...Array.from({ length: 10 }).fill({
            title: 'Second Event',
            date: '2 months ago',
            categoryName: 'app2',
            categoryColor: 'rose',
            location: 'Sale',
          }),
          {
            title: 'Third Event',
            date: 'a year ago',
            location: 'Casablanca',
          },
        ]}
        renderItem={({ item }) => <EventCard event={item} />}
        style={{ maxHeight: '95%' }}
        ItemSeparatorComponent={() => (
          <View style={{ height: spacing[2] }}></View>
        )}
      /> */}
    </View>
  );
}
