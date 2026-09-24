import { radius, spacing, typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { router, useNavigation } from 'expo-router';
import { Download, Plus, Trash2, X } from 'lucide-react-native';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import EventCard from '@/components/event-card';
import { useEventDeletion } from '@/components/event-deletion/EventDeletionProvider';
import { confirmManyEventsDeletion } from '@/components/event-deletion/confirmEventDeletion';
import EventsHeader, {
  type EventsHeaderHandle,
  type TimelineFilters,
  UNCATEGORIZED_FILTER_ID,
  WITHOUT_LOCATION_FILTER_ID,
} from '@/components/EventsHeader';
import TimelineOverflowMenu from '@/components/TimelineOverflowMenu';
import { closeOpenSwipe } from '@/components/ui/SwipeReveal';
import { useAppToast } from '@/components/ui/AppToastProvider';
import {
  type EventListQueryInput,
  useEventCountQuery,
  useInfiniteEventListQuery,
} from '@/data/query';
import type { EventListItem, EventExportQuery } from '@/data/repositories';
import { useEventExportRepository } from '@/data/RepositoryProvider';
import SyncTransferProgressModal from '@/features/sync/SyncTransferProgressModal';
import { useSyncPackageTransfer } from '@/features/sync/useSyncPackageTransfer';
import { exportEventsAsIcs, type IcsExportSource } from '@/features/ics';
import type { LocalDate, UUID } from '@/models';

const PAGE_SIZE = 10;
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

export default function Index() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { showToast } = useAppToast();
  const eventExportRepository = useEventExportRepository();
  const syncTransfer = useSyncPackageTransfer();
  const {
    status: syncStatus,
    exportPackage: exportSyncPackage,
    importPackage: importSyncPackage,
  } = syncTransfer;
  const eventsHeaderRef = useRef<EventsHeaderHandle>(null);
  const [filters, setFilters] = useState<TimelineFilters>(INITIAL_FILTERS);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<UUID>>(
    () => new Set()
  );
  const [isExporting, setIsExporting] = useState(false);
  const { deleteEvents, isDeletingEvents, pendingEventIds } =
    useEventDeletion();
  const selectionMode = selectedEventIds.size > 0;
  const debouncedSearch = useDebouncedValue(filters.search, SEARCH_DEBOUNCE_MS);
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
  const eventExportQuery = useMemo<EventExportQuery>(() => {
    const { limit: _limit, ...query } = eventListQuery;
    return query;
  }, [eventListQuery]);
  const hasSearch = debouncedSearch.trim().length > 0;
  const hasTimelineFilters =
    filters.categoryIds.length > 0 ||
    filters.significance.length > 0 ||
    filters.tagIds.length > 0 ||
    filters.peopleIds.length > 0 ||
    filters.locationIds.length > 0 ||
    Boolean(filters.dateRange.from || filters.dateRange.to) ||
    Boolean(filters.timeRange.from || filters.timeRange.to);
  const hasActiveExportFilters = hasSearch || hasTimelineFilters;
  const eventsQuery = useInfiniteEventListQuery(eventListQuery);
  const eventCountQuery = useEventCountQuery(eventListQuery);
  const sections = useMemo(
    () =>
      groupEventsByDate(
        (eventsQuery.data?.pages.flatMap((page) => page.items) ?? []).filter(
          (item) => !pendingEventIds.has(item.event.id)
        )
      ),
    [eventsQuery.data, pendingEventIds]
  );

  const exitSelectionMode = useCallback(() => {
    setSelectedEventIds(new Set());
  }, []);

  const exportEvents = useCallback(
    async (source: IcsExportSource) => {
      if (isExporting) return;
      setIsExporting(true);
      try {
        await exportEventsAsIcs(source, eventExportRepository);
      } catch (error) {
        showToast({
          message:
            error instanceof Error
              ? error.message
              : 'The events could not be exported.',
          kind: 'error',
        });
      } finally {
        setIsExporting(false);
      }
    },
    [eventExportRepository, isExporting, showToast]
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TimelineOverflowMenu
          exportDisabled={isExporting || syncStatus !== 'idle'}
          onExportSyncPackage={() => void exportSyncPackage()}
          onImportSyncPackage={() => void importSyncPackage()}
          onExportAll={() => void exportEvents({ kind: 'query', query: {} })}
          onExportFiltered={() =>
            void exportEvents({ kind: 'query', query: eventExportQuery })
          }
          showFilteredExport={hasActiveExportFilters}
        />
      ),
    });
  }, [
    eventExportQuery,
    exportEvents,
    syncStatus,
    exportSyncPackage,
    importSyncPackage,
    hasActiveExportFilters,
    isExporting,
    navigation,
  ]);

  const toggleEventSelection = useCallback((id: UUID) => {
    closeOpenSwipe();
    setSelectedEventIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const deleteSelectedEvents = useCallback(() => {
    const ids = [...selectedEventIds];
    if (ids.length === 0) return;
    const selectedEvents =
      eventsQuery.data?.pages
        .flatMap((page) => page.items)
        .filter((item) => selectedEventIds.has(item.event.id))
        .map((item) => ({ id: item.event.id, title: item.event.title })) ?? [];

    confirmManyEventsDeletion(ids.length, () => {
      void deleteEvents(selectedEvents)
        .then(exitSelectionMode)
        .catch(() => {
          showToast({
            message: 'The selected events were not deleted. Please try again.',
            kind: 'error',
          });
        });
    });
  }, [
    deleteEvents,
    eventsQuery.data,
    exitSelectionMode,
    selectedEventIds,
    showToast,
  ]);

  useEffect(() => {
    if (!selectionMode) return;

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        exitSelectionMode();
        return true;
      }
    );
    return () => subscription.remove();
  }, [exitSelectionMode, selectionMode]);

  const loadMore = () => {
    if (eventsQuery.hasNextPage && !eventsQuery.isFetchingNextPage) {
      void eventsQuery.fetchNextPage();
    }
  };

  const syncTransferModal = (
    <SyncTransferProgressModal
      progress={syncTransfer.progress}
      error={syncTransfer.error}
      onCancel={syncTransfer.cancel}
      onRetry={syncTransfer.retry}
      onClose={syncTransfer.closeError}
    />
  );

  if (eventsQuery.isPending) {
    return (
      <View style={[styles.centeredState, { backgroundColor: colors.bg }]}>
        {syncTransferModal}
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
        {syncTransferModal}
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
      {syncTransferModal}
      {selectionMode ? (
        <View
          accessibilityLiveRegion="polite"
          style={[
            styles.selectionToolbar,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
            },
          ]}
        >
          <Pressable
            accessibilityLabel="Exit selection mode"
            accessibilityRole="button"
            hitSlop={8}
            onPress={exitSelectionMode}
            style={({ pressed }) => [
              styles.selectionToolbarButton,
              pressed && { backgroundColor: colors.interactivePressed },
            ]}
          >
            <X color={colors.text} size={22} />
          </Pressable>
          <Text style={[styles.selectionCount, { color: colors.text }]}>
            {selectedEventIds.size} selected
          </Text>
          <Pressable
            accessibilityLabel={`Export ${selectedEventIds.size} selected ${selectedEventIds.size === 1 ? 'event' : 'events'} to an ICS calendar file`}
            accessibilityRole="button"
            disabled={isExporting || isDeletingEvents}
            onPress={() =>
              void exportEvents({
                kind: 'selected',
                ids: [...selectedEventIds],
              })
            }
            style={({ pressed }) => [
              styles.selectionActionButton,
              pressed && { backgroundColor: colors.interactivePressed },
              (isExporting || isDeletingEvents) && styles.disabledAction,
            ]}
          >
            {isExporting ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Download color={colors.primary} size={19} strokeWidth={2} />
            )}
            <Text
              style={[styles.selectionActionText, { color: colors.primary }]}
            >
              Export ICS
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel={`Delete ${selectedEventIds.size} selected ${selectedEventIds.size === 1 ? 'event' : 'events'}`}
            accessibilityRole="button"
            disabled={isDeletingEvents || isExporting}
            onPress={deleteSelectedEvents}
            style={({ pressed }) => [
              styles.deleteSelectedButton,
              pressed && { backgroundColor: colors.destructiveMuted },
              (isDeletingEvents || isExporting) && styles.disabledAction,
            ]}
          >
            {isDeletingEvents ? (
              <ActivityIndicator color={colors.destructive} size="small" />
            ) : (
              <Trash2 color={colors.destructive} size={19} strokeWidth={2} />
            )}
            <Text
              style={[styles.deleteSelectedText, { color: colors.destructive }]}
            >
              Delete
            </Text>
          </Pressable>
        </View>
      ) : (
        <EventsHeader
          ref={eventsHeaderRef}
          eventCount={
            eventCountQuery.data === undefined
              ? undefined
              : Math.max(0, eventCountQuery.data - pendingEventIds.size)
          }
          filters={filters}
          isEventCountFetching={eventCountQuery.isFetching}
          onChange={setFilters}
          onClear={() =>
            setFilters((current) => ({
              ...INITIAL_FILTERS,
              search: current.search,
            }))
          }
        />
      )}
      <SectionList
        sections={sections}
        contentContainerStyle={[
          styles.listContent,
          sections.length === 0 && styles.emptyListContent,
        ]}
        keyExtractor={(item) => item.event.id}
        renderItem={({ item }) => (
          <EventCard
            event={item}
            isSelected={selectedEventIds.has(item.event.id)}
            selectionMode={selectionMode}
            onSelect={() => toggleEventSelection(item.event.id)}
          />
        )}
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
          <TimelineEmptyState
            hasSearch={hasSearch}
            hasTimelineFilters={hasTimelineFilters}
            onClearAll={() => setFilters(INITIAL_FILTERS)}
            onClearFilters={() =>
              setFilters((current) => ({
                ...INITIAL_FILTERS,
                search: current.search,
              }))
            }
            onClearSearch={() =>
              setFilters((current) => ({ ...current, search: '' }))
            }
            onCreate={() => router.push('/new')}
            onEditFilters={() => eventsHeaderRef.current?.openFilters()}
            search={filters.search}
          />
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
      {!selectionMode && (
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
      )}
    </View>
  );
}

type TimelineEmptyStateProps = {
  hasSearch: boolean;
  hasTimelineFilters: boolean;
  onClearAll: () => void;
  onClearFilters: () => void;
  onClearSearch: () => void;
  onCreate: () => void;
  onEditFilters: () => void;
  search: string;
};

function TimelineEmptyState({
  hasSearch,
  hasTimelineFilters,
  onClearAll,
  onClearFilters,
  onClearSearch,
  onCreate,
  onEditFilters,
  search,
}: TimelineEmptyStateProps) {
  const { colors } = useTheme();

  if (!hasSearch && !hasTimelineFilters) {
    return (
      <View style={styles.emptyState}>
        <Text style={[styles.stateTitle, { color: colors.text }]}>
          Your timeline starts here
        </Text>
        <Text style={[styles.stateText, { color: colors.textMuted }]}>
          Capture meaningful moments and everyday events as they happen.
        </Text>
        <PrimaryStateAction label="Create event" onPress={onCreate} />
      </View>
    );
  }

  if (hasSearch && !hasTimelineFilters) {
    const normalizedSearch = search.trim();
    const displayedSearch =
      normalizedSearch.length > 42
        ? `${normalizedSearch.slice(0, 39)}…`
        : normalizedSearch;

    return (
      <View style={styles.emptyState}>
        <Text style={[styles.stateTitle, { color: colors.text }]}>
          No events found
        </Text>
        <Text style={[styles.stateText, { color: colors.textMuted }]}>
          Nothing matches “{displayedSearch}”.
        </Text>
        <PrimaryStateAction label="Clear search" onPress={onClearSearch} />
      </View>
    );
  }

  if (!hasSearch && hasTimelineFilters) {
    return (
      <View style={styles.emptyState}>
        <Text style={[styles.stateTitle, { color: colors.text }]}>
          No events match these filters
        </Text>
        <Text style={[styles.stateText, { color: colors.textMuted }]}>
          Try changing your selections or clearing the filters.
        </Text>
        <PrimaryStateAction label="Edit filters" onPress={onEditFilters} />
        <SecondaryStateAction
          label="Clear all filters"
          onPress={onClearFilters}
        />
      </View>
    );
  }

  return (
    <View style={styles.emptyState}>
      <Text style={[styles.stateTitle, { color: colors.text }]}>
        No matching events
      </Text>
      <Text style={[styles.stateText, { color: colors.textMuted }]}>
        Try a different search or adjust your filters.
      </Text>
      <View style={styles.emptyActionsRow}>
        <SecondaryStateAction label="Clear search" onPress={onClearSearch} />
        <PrimaryStateAction label="Edit filters" onPress={onEditFilters} />
      </View>
      <SecondaryStateAction label="Clear everything" onPress={onClearAll} />
    </View>
  );
}

function PrimaryStateAction({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryStateAction,
        {
          backgroundColor: pressed ? colors.primaryPressed : colors.primary,
        },
      ]}
    >
      <Text
        style={[styles.primaryStateActionText, { color: colors.onPrimary }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SecondaryStateAction({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryStateAction,
        { borderColor: colors.borderStrong },
        pressed && { backgroundColor: colors.interactivePressed },
      ]}
    >
      <Text
        style={[
          styles.secondaryStateActionText,
          { color: colors.textSecondary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    height: '100%',
    gap: spacing[2],
    paddingHorizontal: 20,
  },
  selectionToolbar: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[2],
  },
  selectionToolbarButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  selectionCount: {
    ...typography.body,
    flex: 1,
    fontWeight: '700',
  },
  deleteSelectedButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    borderRadius: radius.sm,
    paddingHorizontal: spacing[3],
  },
  selectionActionButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    borderRadius: radius.sm,
    paddingHorizontal: spacing[3],
  },
  selectionActionText: {
    ...typography.small,
    fontWeight: '700',
  },
  deleteSelectedText: {
    ...typography.small,
    fontWeight: '700',
  },
  disabledAction: {
    opacity: 0.55,
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
    gap: spacing[3],
    paddingHorizontal: spacing[6],
  },
  emptyActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing[2],
  },
  stateTitle: {
    ...typography.h3,
    textAlign: 'center',
  },
  stateText: {
    ...typography.small,
    maxWidth: 340,
    textAlign: 'center',
  },
  primaryStateAction: {
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing[5],
  },
  primaryStateActionText: {
    ...typography.small,
    fontWeight: '700',
  },
  secondaryStateAction: {
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[4],
  },
  secondaryStateActionText: {
    ...typography.small,
    fontWeight: '600',
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

function useDebouncedValue<T>(value: T, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedValue(value), delay);

    return () => clearTimeout(timeout);
  }, [delay, value]);

  return debouncedValue;
}

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
