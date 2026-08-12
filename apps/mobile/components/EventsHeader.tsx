import { eventColors, spacing } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { RotateCcw } from 'lucide-react-native';
import React, { type Dispatch, type SetStateAction, useMemo } from 'react';
import {
  Platform,
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
  hasActiveFilters,
  onChange,
  onClear,
}: EventsHeaderProps) {
  const { colors, isDark } = useTheme();
  const categoriesQuery = useCategoriesQuery();
  const locationsQuery = useLocationsQuery();
  const tagsQuery = useTagsQuery();
  const peopleQuery = usePeopleQuery();
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
    <View style={styles.root}>
      <SearchInput
        value={filters.search}
        onChangeText={(search) =>
          onChange((current) => ({ ...current, search }))
        }
        placeholder="Search events..."
        autoCorrect={false}
        clearButtonMode="while-editing"
        showClear={filters.search.length > 0 && Platform.OS !== 'ios'}
        clear={() => onChange((current) => ({ ...current, search: '' }))}
      />
      <ScrollView
        horizontal
        contentContainerStyle={styles.filters}
        showsHorizontalScrollIndicator={false}
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 12,
    paddingTop: 12,
    paddingBottom: spacing[3],
  },
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
