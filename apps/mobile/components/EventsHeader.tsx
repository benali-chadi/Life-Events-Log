import { eventColors, radius, spacing, typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { SlidersHorizontal, X } from 'lucide-react-native';
import React, {
  type Dispatch,
  type SetStateAction,
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import TimelineFiltersSheet, {
  countActiveFilterGroups,
  type TimelineFilterSectionId,
} from './TimelineFiltersSheet';
import SearchInput from './ui/SearchInput';
import type {
  MultiSelectOption,
  MultiValueMatchMode,
} from './ui/searchable-multi-select/SearchableMultiSelect';
import {
  useCategoriesQuery,
  useLocationsQuery,
  usePeopleQuery,
  useTagsQuery,
} from '@/data/query';
import {
  EVENT_SIGNIFICANCE_VALUES,
  type EventSignificance,
  type LocalDate,
  type LocalTime,
} from '@/models';

export const UNCATEGORIZED_FILTER_ID = '__uncategorized__';
export const WITHOUT_LOCATION_FILTER_ID = '__without_location__';

export type TimelineFilters = {
  search: string;
  categoryIds: string[];
  significance: EventSignificance[];
  tagIds: string[];
  tagMatchMode: MultiValueMatchMode;
  peopleIds: string[];
  peopleMatchMode: MultiValueMatchMode;
  locationIds: string[];
  dateRange: { from?: LocalDate; to?: LocalDate };
  timeRange: { from?: LocalTime; to?: LocalTime };
};

type EventsHeaderProps = {
  eventCount?: number;
  filters: TimelineFilters;
  isEventCountFetching: boolean;
  onChange: Dispatch<SetStateAction<TimelineFilters>>;
  onClear: () => void;
};

export type EventsHeaderHandle = {
  openFilters: (section?: TimelineFilterSectionId) => void;
};

const significanceLabels: Record<EventSignificance, string> = {
  ordinary: 'Ordinary',
  notable: 'Notable',
  major: 'Major',
  'turning-point': 'Turning point',
};

const EventsHeader = forwardRef<EventsHeaderHandle, EventsHeaderProps>(
  function EventsHeader(
    { eventCount, filters, isEventCountFetching, onChange, onClear },
    ref
  ) {
    const { colors, isDark } = useTheme();
    const categoriesQuery = useCategoriesQuery();
    const locationsQuery = useLocationsQuery();
    const tagsQuery = useTagsQuery();
    const peopleQuery = usePeopleQuery();
    const [sheetSection, setSheetSection] = useState<TimelineFilterSectionId>();
    const [isSheetOpen, setIsSheetOpen] = useState(false);

    const categoryOptions = useMemo<MultiSelectOption[]>(
      () => [
        {
          id: UNCATEGORIZED_FILTER_ID,
          label: 'Uncategorized',
          description: 'Events without a category',
          pinned: true,
        },
        ...(categoriesQuery.data ?? []).map((category) => ({
          id: category.id,
          label: category.displayName ?? category.name,
          color: eventColors[category.color][isDark ? 'dark' : 'light'],
        })),
      ],
      [categoriesQuery.data, isDark]
    );
    const significanceOptions = useMemo<MultiSelectOption[]>(
      () =>
        EVENT_SIGNIFICANCE_VALUES.map((significance) => ({
          id: significance,
          label: significanceLabels[significance],
        })),
      []
    );
    const locationOptions = useMemo<MultiSelectOption[]>(
      () => [
        {
          id: WITHOUT_LOCATION_FILTER_ID,
          label: 'No location',
          description: 'Events without a location',
          pinned: true,
        },
        ...(locationsQuery.data ?? []).map((location) => ({
          id: location.id,
          label: location.displayName ?? location.name,
        })),
      ],
      [locationsQuery.data]
    );
    const tagOptions = useMemo(
      () =>
        (tagsQuery.data ?? []).map((tag) => ({
          id: tag.id,
          label: tag.displayName ?? tag.name,
        })),
      [tagsQuery.data]
    );
    const peopleOptions = useMemo(
      () =>
        (peopleQuery.data ?? []).map((person) => ({
          id: person.id,
          label: person.displayName ?? person.name,
        })),
      [peopleQuery.data]
    );
    const activeFilterCount = countActiveFilterGroups(filters);
    const chips = buildActiveChips({
      categoryOptions,
      filters,
      locationOptions,
      peopleOptions,
      significanceOptions,
      tagOptions,
    });

    const openSheet = useCallback((section?: TimelineFilterSectionId) => {
      setSheetSection(section);
      setIsSheetOpen(true);
    }, []);

    useImperativeHandle(ref, () => ({ openFilters: openSheet }), [openSheet]);

    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <View style={styles.toolbar}>
          <SearchInput
            autoCorrect={false}
            blurOnKeyboardHide
            clear={() => onChange((current) => ({ ...current, search: '' }))}
            showClear={!!filters.search.length}
            clearButtonMode="while-editing"
            containerStyle={styles.searchInput}
            onChangeText={(search) =>
              onChange((current) => ({ ...current, search }))
            }
            placeholder="Search events…"
            value={filters.search}
          />
          <Pressable
            accessibilityLabel={`Filters, ${activeFilterCount} active`}
            accessibilityRole="button"
            accessibilityState={{ expanded: isSheetOpen }}
            onPress={() => openSheet()}
            style={({ pressed }) => [
              styles.filterButton,
              {
                backgroundColor: activeFilterCount
                  ? colors.interactiveMuted
                  : colors.surface,
                borderColor: activeFilterCount
                  ? colors.borderStrong
                  : colors.border,
              },
              pressed && { backgroundColor: colors.interactivePressed },
            ]}
          >
            <SlidersHorizontal color={colors.textSecondary} size={17} />
            <Text style={[styles.filterButtonText, { color: colors.text }]}>
              Filters
            </Text>
            {activeFilterCount > 0 && (
              <View
                style={[
                  styles.filterCount,
                  { backgroundColor: colors.primary },
                ]}
              >
                <Text
                  style={[styles.filterCountText, { color: colors.onPrimary }]}
                >
                  {activeFilterCount}
                </Text>
              </View>
            )}
          </Pressable>
        </View>

        {chips.length > 0 && (
          <View style={styles.activeFiltersRow}>
            <ScrollView
              horizontal
              contentContainerStyle={styles.chips}
              showsHorizontalScrollIndicator={false}
            >
              {chips.map((chip) => (
                <Pressable
                  key={chip.section}
                  accessibilityRole="button"
                  onPress={() => openSheet(chip.section)}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      backgroundColor: colors.interactiveMuted,
                      borderColor: colors.borderStrong,
                    },
                    pressed && { backgroundColor: colors.interactivePressed },
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[styles.chipText, { color: colors.textSecondary }]}
                  >
                    {chip.label}
                  </Text>
                  <Pressable
                    accessibilityLabel={`Clear ${chip.section} filter`}
                    accessibilityRole="button"
                    hitSlop={spacing[2]}
                    onPress={(event) => {
                      event.stopPropagation();
                      onChange((current) =>
                        clearFilterSection(current, chip.section)
                      );
                    }}
                  >
                    <X color={colors.textMuted} size={14} strokeWidth={2.25} />
                  </Pressable>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              onPress={onClear}
              style={({ pressed }) => [
                styles.clearAll,
                pressed && { backgroundColor: colors.interactivePressed },
              ]}
            >
              <Text
                style={[styles.clearAllText, { color: colors.textSecondary }]}
              >
                Clear all
              </Text>
            </Pressable>
          </View>
        )}

        <TimelineFiltersSheet
          categoryOptions={categoryOptions}
          filters={filters}
          initialSection={sheetSection}
          isResultCountFetching={isEventCountFetching}
          locationOptions={locationOptions}
          onChange={(nextFilters) => onChange(nextFilters)}
          onClear={onClear}
          onRequestClose={() => setIsSheetOpen(false)}
          peopleOptions={peopleOptions}
          resultCount={eventCount}
          significanceOptions={significanceOptions}
          tagOptions={tagOptions}
          visible={isSheetOpen}
        />
      </View>
    );
  }
);

export default EventsHeader;

type ActiveChip = { label: string; section: TimelineFilterSectionId };

function buildActiveChips({
  categoryOptions,
  filters,
  locationOptions,
  peopleOptions,
  significanceOptions,
  tagOptions,
}: {
  categoryOptions: MultiSelectOption[];
  filters: TimelineFilters;
  locationOptions: MultiSelectOption[];
  peopleOptions: MultiSelectOption[];
  significanceOptions: MultiSelectOption[];
  tagOptions: MultiSelectOption[];
}) {
  const chips: ActiveChip[] = [];
  const addSelection = (
    section: TimelineFilterSectionId,
    label: string,
    ids: string[],
    options: MultiSelectOption[]
  ) => {
    if (!ids.length) return;
    const first =
      options.find((option) => option.id === ids[0])?.label ?? 'Selected';
    chips.push({
      section,
      label: `${label}: ${first}${ids.length > 1 ? ` +${ids.length - 1}` : ''}`,
    });
  };
  addSelection('category', 'Category', filters.categoryIds, categoryOptions);
  addSelection(
    'significance',
    'Significance',
    filters.significance,
    significanceOptions
  );
  addSelection('tags', 'Tags', filters.tagIds, tagOptions);
  addSelection('people', 'People', filters.peopleIds, peopleOptions);
  addSelection('location', 'Location', filters.locationIds, locationOptions);
  if (filters.dateRange.from || filters.dateRange.to) {
    chips.push({
      section: 'date',
      label: `Date: ${formatRangeSummary(filters.dateRange.from, filters.dateRange.to)}`,
    });
  }
  if (filters.timeRange.from || filters.timeRange.to) {
    chips.push({
      section: 'time',
      label: `Time: ${formatRangeSummary(filters.timeRange.from, filters.timeRange.to)}`,
    });
  }
  return chips;
}

function formatRangeSummary(from?: string, to?: string) {
  if (from && to) return `${from} – ${to}`;
  if (from) return `From ${from}`;
  return `Until ${to}`;
}

function clearFilterSection(
  filters: TimelineFilters,
  section: TimelineFilterSectionId
): TimelineFilters {
  if (section === 'category') return { ...filters, categoryIds: [] };
  if (section === 'significance') return { ...filters, significance: [] };
  if (section === 'tags') return { ...filters, tagIds: [] };
  if (section === 'people') return { ...filters, peopleIds: [] };
  if (section === 'location') return { ...filters, locationIds: [] };
  if (section === 'date') return { ...filters, dateRange: {} };
  return { ...filters, timeRange: {} };
}

const styles = StyleSheet.create({
  root: { gap: spacing[2], paddingTop: spacing[3], paddingBottom: spacing[2] },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  searchInput: { flex: 1, minWidth: 0, marginHorizontal: 0, marginBottom: 0 },
  filterButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[3],
    borderWidth: 1,
    borderRadius: radius.md,
  },
  filterButtonText: { ...typography.small, fontWeight: '600' },
  filterCount: {
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[1],
    borderRadius: radius.md,
  },
  filterCountText: { ...typography.caption, fontWeight: '700' },
  activeFiltersRow: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  chips: { gap: spacing[2] },
  chip: {
    maxWidth: 220,
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  chipText: { ...typography.caption, flexShrink: 1 },
  clearAll: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: spacing[2],
    borderRadius: radius.sm,
  },
  clearAllText: { ...typography.caption, fontWeight: '600' },
});
