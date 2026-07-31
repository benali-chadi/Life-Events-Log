import { radius, spacing, typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import EventCard from '@/components/event-card';
import { closeOpenSwipe } from '@/components/ui/SwipeReveal';
import { useInfiniteEventListQuery } from '@/data/query';
import type { EventListItem } from '@/data/repositories';
import type { LocalDate } from '@/models';

const PAGE_SIZE = 6;

function localDateToday(): LocalDate {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}` as LocalDate;
}

function shiftLocalDate(date: LocalDate, days: number): LocalDate {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const shifted = new Date(year, month - 1, day + days);
  const shiftedMonth = String(shifted.getMonth() + 1).padStart(2, '0');
  const shiftedDay = String(shifted.getDate()).padStart(2, '0');

  return `${shifted.getFullYear()}-${shiftedMonth}-${shiftedDay}` as LocalDate;
}

function formatSectionDate(date: LocalDate) {
  const today = localDateToday();

  if (date === today) return 'Today';
  if (date === shiftLocalDate(today, -1)) return 'Yesterday';

  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'long',
    year: year === new Date().getFullYear() ? undefined : 'numeric',
  }).format(new Date(year, month - 1, day, 12));
}

function groupEventsByDate(items: EventListItem[]) {
  const groups = new Map<LocalDate, EventListItem[]>();

  for (const item of items) {
    const existing = groups.get(item.event.date);

    if (existing) existing.push(item);
    else groups.set(item.event.date, [item]);
  }

  return Array.from(groups, ([date, data]) => ({
    date,
    title: formatSectionDate(date),
    data,
  }));
}

export default function Index() {
  const { colors } = useTheme();
  const eventsQuery = useInfiniteEventListQuery({ limit: PAGE_SIZE });
  const sections = useMemo(
    () =>
      groupEventsByDate(
        eventsQuery.data?.pages.flatMap((page) => page.items) ?? []
      ),
    [eventsQuery.data]
  );

  const loadMore = () => {
    if (eventsQuery.hasNextPage && !eventsQuery.isFetchingNextPage) {
      void eventsQuery.fetchNextPage();
    }
  };

  if (eventsQuery.isPending) {
    return (
      <View style={[styles.centeredState, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.stateText, { color: colors.textMuted }]}>
          Loading events…
        </Text>
      </View>
    );
  }

  if (eventsQuery.isError) {
    return (
      <View style={[styles.centeredState, { backgroundColor: colors.bg }]}>
        <Text style={[styles.stateTitle, { color: colors.text }]}>
          Couldn’t load events
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void eventsQuery.refetch()}
          style={({ pressed }) => [
            styles.retryButton,
            {
              backgroundColor: pressed ? colors.primaryPressed : colors.primary,
            },
          ]}
        >
          <Text style={[styles.retryText, { color: colors.onPrimary }]}>
            Retry
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <SectionList
        sections={sections}
        contentContainerStyle={[
          styles.listContent,
          sections.length === 0 && styles.emptyListContent,
        ]}
        keyExtractor={(item) => item.event.id}
        renderItem={({ item }) => <EventCard event={item} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        onRefresh={() => void eventsQuery.refetch()}
        refreshing={eventsQuery.isRefetching && !eventsQuery.isFetchingNextPage}
        onScrollBeginDrag={closeOpenSwipe}
        showsVerticalScrollIndicator={false}
        renderSectionHeader={({ section: { title } }) => (
          <View style={[styles.sectionHeader, { backgroundColor: colors.bg }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {title}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[styles.stateTitle, { color: colors.text }]}>
              No events yet
            </Text>
            <Text style={[styles.stateText, { color: colors.textMuted }]}>
              Create your first event to start your timeline.
            </Text>
          </View>
        }
        ListFooterComponent={
          eventsQuery.isFetchingNextPage ? (
            <ActivityIndicator
              color={colors.primary}
              style={styles.loadingMore}
            />
          ) : null
        }
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
            backgroundColor: pressed ? colors.primaryPressed : colors.primary,
          },
        ]}
      >
        <Plus color={colors.onPrimary} size={26} strokeWidth={2.25} />
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
  emptyListContent: {
    flexGrow: 1,
  },
  sectionHeader: {
    paddingVertical: spacing[1],
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
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[6],
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[6],
  },
  stateTitle: {
    ...typography.h3,
    textAlign: 'center',
  },
  stateText: {
    ...typography.small,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing[5],
  },
  retryText: {
    ...typography.small,
    fontWeight: '700',
  },
  loadingMore: {
    marginVertical: spacing[4],
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
