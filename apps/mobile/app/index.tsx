import { radius, spacing, typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  type LayoutChangeEvent,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import EventCard from '@/components/event-card';
import EventsHeader, {
  type TimelineFilters,
  UNCATEGORIZED_FILTER_ID,
  WITHOUT_LOCATION_FILTER_ID,
} from '@/components/EventsHeader';
import { closeOpenSwipe } from '@/components/ui/SwipeReveal';
import {
  type EventListQueryInput,
  useInfiniteEventListQuery,
} from '@/data/query';
import type { EventListItem } from '@/data/repositories';
import type { LocalDate } from '@/models';

const PAGE_SIZE = 5;
const SEARCH_DEBOUNCE_MS = 300;

const INITIAL_FILTERS: TimelineFilters = {
  search: '',
  categoryIds: [],
  significance: [],
  tagIds: [],
  tagMatchMode: 'all',
  peopleIds: [],
  peopleMatchMode: 'all',
  locationIds: [],
  dateRange: {},
  timeRange: {},
};

function useDebouncedValue<T>(value: T, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedValue(value), delay);

    return () => clearTimeout(timeout);
  }, [delay, value]);

  return debouncedValue;
}

type TimelineSection = {
  date: LocalDate;
  title: string;
  data: EventListItem[];
};

const AnimatedSectionList = Animated.createAnimatedComponent(
  SectionList<EventListItem, TimelineSection>
);

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
  const [filters, setFilters] = useState<TimelineFilters>(INITIAL_FILTERS);
  const debouncedSearch = useDebouncedValue(filters.search, SEARCH_DEBOUNCE_MS);
  const scrollY = useRef(new Animated.Value(0)).current;
  const [toolbarHeight, setToolbarHeight] = useState(0);
  const clampedScrollY = useMemo(
    () => Animated.diffClamp(scrollY, 0, toolbarHeight),
    [scrollY, toolbarHeight]
  );
  const toolbarTranslateY = Animated.multiply(clampedScrollY, -1);
  const eventListQuery = useMemo<EventListQueryInput>(() => {
    const categoryIds = filters.categoryIds.filter(
      (id) => id !== UNCATEGORIZED_FILTER_ID
    );
    const locationIds = filters.locationIds.filter(
      (id) => id !== WITHOUT_LOCATION_FILTER_ID
    );
    const search = debouncedSearch.trim();

    return {
      limit: PAGE_SIZE,
      search: search || undefined,
      categoryIds: categoryIds.length ? categoryIds : undefined,
      includeUncategorized:
        filters.categoryIds.includes(UNCATEGORIZED_FILTER_ID) || undefined,
      significance: filters.significance.length
        ? filters.significance
        : undefined,
      tagIds: filters.tagIds.length
        ? { ids: filters.tagIds, match: filters.tagMatchMode }
        : undefined,
      peopleIds: filters.peopleIds.length
        ? { ids: filters.peopleIds, match: filters.peopleMatchMode }
        : undefined,
      locationIds: locationIds.length ? locationIds : undefined,
      includeWithoutLocation:
        filters.locationIds.includes(WITHOUT_LOCATION_FILTER_ID) || undefined,
      dateFrom: filters.dateRange.from,
      dateTo: filters.dateRange.to,
      timeFrom: filters.timeRange.from,
      timeTo: filters.timeRange.to,
    };
  }, [debouncedSearch, filters]);
  const hasActiveFilters =
    filters.search.trim().length > 0 ||
    filters.categoryIds.length > 0 ||
    filters.significance.length > 0 ||
    filters.tagIds.length > 0 ||
    filters.peopleIds.length > 0 ||
    filters.locationIds.length > 0 ||
    Boolean(filters.dateRange.from || filters.dateRange.to) ||
    Boolean(filters.timeRange.from || filters.timeRange.to);
  const eventsQuery = useInfiniteEventListQuery(eventListQuery);
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

  const measureToolbar = (event: LayoutChangeEvent) => {
    const measuredHeight = event.nativeEvent.layout.height;

    if (measuredHeight !== toolbarHeight) setToolbarHeight(measuredHeight);
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
      <AnimatedSectionList
        sections={sections}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: toolbarHeight },
          sections.length === 0 && styles.emptyListContent,
        ]}
        keyExtractor={(item) => item.event.id}
        renderItem={({ item }) => <EventCard event={item} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        onRefresh={() => void eventsQuery.refetch()}
        refreshing={eventsQuery.isRefetching && !eventsQuery.isFetchingNextPage}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        onScrollBeginDrag={closeOpenSwipe}
        scrollEventThrottle={16}
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
              {hasActiveFilters ? 'No matching events' : 'No events yet'}
            </Text>
            <Text style={[styles.stateText, { color: colors.textMuted }]}>
              {hasActiveFilters
                ? 'Try changing or clearing your search and filters.'
                : 'Create your first event to start your timeline.'}
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
      <Animated.View
        onLayout={measureToolbar}
        style={[
          styles.timelineToolbar,
          {
            backgroundColor: colors.bg,
            transform: [{ translateY: toolbarTranslateY }],
          },
        ]}
      >
        <EventsHeader
          filters={filters}
          hasActiveFilters={hasActiveFilters}
          onChange={setFilters}
          onClear={() => setFilters(INITIAL_FILTERS)}
        />
      </Animated.View>
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
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 96,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  timelineToolbar: {
    position: 'absolute',
    zIndex: 2,
    top: 0,
    left: 20,
    right: 20,
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
