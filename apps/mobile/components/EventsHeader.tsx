import { eventColors, spacing } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { RotateCcw } from 'lucide-react-native';
import React, {
  type Dispatch,
  type SetStateAction,
  useMemo,
  useState,
} from 'react';
import {
  Platform,
  LayoutAnimation,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  useCategoriesQuery,
  useLocationsQuery,
  usePeopleQuery,
  useTagsQuery,
} from '@/data/query';
import { EVENT_SIGNIFICANCE_VALUES, type EventSignificance } from '@/models';

import SearchableMultiSelect, {
  type MultiValueMatchMode,
  type MultiSelectOption,
} from './ui/searchable-multi-select/SearchableMultiSelect';
import SearchInput from './ui/SearchInput';
import DateTimeRangeFilter, {
  type DateRangeValue,
  type TimeRangeValue,
} from './ui/DateTimeRangeFilter';

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
  dateRange: DateRangeValue;
  timeRange: TimeRangeValue;
};

type EventsHeaderProps = {
  filters: TimelineFilters;
  compact?: boolean;
  hasActiveFilters: boolean;
  onChange: Dispatch<SetStateAction<TimelineFilters>>;
  onClear: () => void;
};

const significanceLabels: Record<EventSignificance, string> = {
  ordinary: 'Ordinary',
  notable: 'Notable',
  major: 'Major',
  'turning-point': 'Turning point',
};

export default function EventsHeader({
  filters,
  compact = false,
  hasActiveFilters,
  onChange,
  onClear,
}: EventsHeaderProps) {
  const { colors, isDark } = useTheme();
  const categoriesQuery = useCategoriesQuery();
  const locationsQuery = useLocationsQuery();
  const tagsQuery = useTagsQuery();
  const peopleQuery = usePeopleQuery();
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchExpanded = !compact || isSearchFocused;
  const compactSearchPreview =
    compact && !isSearchFocused
      ? filters.search.trim().split(/\s+/)[0] || undefined
      : undefined;
  const setSearchFocused = (focused: boolean) => {
    if (!compact || focused === isSearchFocused) {
      setIsSearchFocused(focused);
      return;
    }

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsSearchFocused(focused);
  };
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
        label: category.name,
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
        label: location.name,
      })),
    ],
    [locationsQuery.data]
  );
  const tagOptions = useMemo<MultiSelectOption[]>(
    () =>
      (tagsQuery.data ?? []).map((tag) => ({
        id: tag.id,
        label: tag.name,
      })),
    [tagsQuery.data]
  );
  const peopleOptions = useMemo<MultiSelectOption[]>(
    () =>
      (peopleQuery.data ?? []).map((person) => ({
        id: person.id,
        label: person.name,
      })),
    [peopleQuery.data]
  );

  return (
    <View
      style={[
        styles.root,
        compact && styles.rootCompact,
        { backgroundColor: colors.bg },
      ]}
    >
      <View
        style={[
          styles.searchSlot,
          compact && !isSearchFocused && styles.searchSlotCompact,
          compactSearchPreview && styles.searchSlotWithPreview,
          compact && isSearchFocused && styles.searchSlotFocused,
        ]}
      >
        <SearchInput
          autoCorrect={false}
          blurOnKeyboardHide
          clear={() => onChange((current) => ({ ...current, search: '' }))}
          clearButtonMode="while-editing"
          collapsedPreview={compactSearchPreview}
          containerStyle={[
            styles.searchInput,
            compact && styles.searchInputCompact,
            compact &&
              filters.search.length > 0 && {
                borderColor: colors.borderStrong,
                backgroundColor: colors.interactiveMuted,
              },
          ]}
          onBlur={() => setSearchFocused(false)}
          onChangeText={(search) =>
            onChange((current) => ({ ...current, search }))
          }
          onFocus={() => setSearchFocused(true)}
          placeholder={searchExpanded ? 'Search events...' : ''}
          showClear={
            searchExpanded && filters.search.length > 0 && Platform.OS !== 'ios'
          }
          value={filters.search}
        />
      </View>

      {(!compact || !isSearchFocused) && (
        <FilterStrip
          categoryOptions={categoryOptions}
          categoriesQuery={categoriesQuery}
          colors={colors}
          compact={compact}
          filters={filters}
          hasActiveFilters={hasActiveFilters}
          locationOptions={locationOptions}
          locationsQuery={locationsQuery}
          onChange={onChange}
          onClear={onClear}
          peopleOptions={peopleOptions}
          peopleQuery={peopleQuery}
          significanceOptions={significanceOptions}
          tagOptions={tagOptions}
          tagsQuery={tagsQuery}
        />
      )}
    </View>
  );
}

type FilterStripProps = {
  categoryOptions: MultiSelectOption[];
  categoriesQuery: ReturnType<typeof useCategoriesQuery>;
  colors: ReturnType<typeof useTheme>['colors'];
  compact?: boolean;
  filters: TimelineFilters;
  hasActiveFilters: boolean;
  locationOptions: MultiSelectOption[];
  locationsQuery: ReturnType<typeof useLocationsQuery>;
  onChange: Dispatch<SetStateAction<TimelineFilters>>;
  onClear: () => void;
  peopleOptions: MultiSelectOption[];
  peopleQuery: ReturnType<typeof usePeopleQuery>;
  significanceOptions: MultiSelectOption[];
  tagOptions: MultiSelectOption[];
  tagsQuery: ReturnType<typeof useTagsQuery>;
};

function FilterStrip({
  categoryOptions,
  categoriesQuery,
  colors,
  compact = false,
  filters,
  hasActiveFilters,
  locationOptions,
  locationsQuery,
  onChange,
  onClear,
  peopleOptions,
  peopleQuery,
  significanceOptions,
  tagOptions,
  tagsQuery,
}: FilterStripProps) {
  return (
    <ScrollView
      horizontal
      contentContainerStyle={styles.filters}
      showsHorizontalScrollIndicator={false}
      style={compact ? styles.filtersCompact : undefined}
    >
      <SearchableMultiSelect
        label="Category"
        options={categoryOptions}
        selectedIds={filters.categoryIds}
        onChange={(categoryIds) =>
          onChange((current) => ({ ...current, categoryIds }))
        }
        searchPlaceholder="Search categories..."
        disabled={categoriesQuery.isPending || categoriesQuery.isError}
      />
      <SearchableMultiSelect
        label="Significance"
        options={significanceOptions}
        selectedIds={filters.significance}
        onChange={(significance) =>
          onChange((current) => ({
            ...current,
            significance: significance as EventSignificance[],
          }))
        }
        searchPlaceholder="Search significance..."
      />
      <SearchableMultiSelect
        label="Tags"
        options={tagOptions}
        selectedIds={filters.tagIds}
        onChange={(tagIds) => onChange((current) => ({ ...current, tagIds }))}
        matchMode={filters.tagMatchMode}
        onMatchModeChange={(tagMatchMode) =>
          onChange((current) => ({ ...current, tagMatchMode }))
        }
        searchPlaceholder="Search tags..."
        disabled={tagsQuery.isPending || tagsQuery.isError}
      />
      <SearchableMultiSelect
        label="People"
        options={peopleOptions}
        selectedIds={filters.peopleIds}
        onChange={(peopleIds) =>
          onChange((current) => ({ ...current, peopleIds }))
        }
        matchMode={filters.peopleMatchMode}
        onMatchModeChange={(peopleMatchMode) =>
          onChange((current) => ({ ...current, peopleMatchMode }))
        }
        searchPlaceholder="Search people..."
        disabled={peopleQuery.isPending || peopleQuery.isError}
      />
      <SearchableMultiSelect
        label="Location"
        options={locationOptions}
        selectedIds={filters.locationIds}
        onChange={(locationIds) =>
          onChange((current) => ({ ...current, locationIds }))
        }
        searchPlaceholder="Search locations..."
        disabled={locationsQuery.isPending || locationsQuery.isError}
      />
      <DateTimeRangeFilter
        mode="date"
        value={filters.dateRange}
        onChange={(dateRange) =>
          onChange((current) => ({ ...current, dateRange }))
        }
      />
      <DateTimeRangeFilter
        mode="time"
        value={filters.timeRange}
        onChange={(timeRange) =>
          onChange((current) => ({ ...current, timeRange }))
        }
      />
      {hasActiveFilters && (
        <Pressable
          accessibilityLabel="Clear search and filters"
          accessibilityRole="button"
          onPress={onClear}
          style={({ pressed }) => [
            styles.clearFilters,
            pressed && styles.clearFiltersPressed,
          ]}
        >
          <RotateCcw color={colors.textSecondary} size={14} strokeWidth={2} />
          <Text
            style={[styles.clearFiltersText, { color: colors.textSecondary }]}
          >
            Clear
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 12,
    paddingTop: 12,
    paddingBottom: spacing[3],
  },
  rootCompact: {
    minHeight: 52,
    paddingTop: spacing[2],
    paddingBottom: spacing[2],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  searchSlot: { width: '100%' },
  searchSlotCompact: { width: 46 },
  searchSlotWithPreview: { width: 112 },
  searchSlotFocused: { flex: 1, width: 'auto' },
  searchInput: {
    minWidth: 0,
    marginHorizontal: 0,
    marginBottom: 0,
  },
  searchInputCompact: { paddingHorizontal: spacing[3] },
  filtersCompact: { flex: 1 },
  filters: {
    gap: spacing[2],
  },
  clearFilters: {
    minHeight: 36,
    paddingHorizontal: spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  clearFiltersPressed: { opacity: 0.6 },
  clearFiltersText: { fontSize: 13, fontWeight: '500' },
});
