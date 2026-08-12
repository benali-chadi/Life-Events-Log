import { eventColors, spacing } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import React, { useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
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

const UNCATEGORIZED_FILTER_ID = '__uncategorized__';
const WITHOUT_LOCATION_FILTER_ID = '__without_location__';

const significanceLabels: Record<EventSignificance, string> = {
  ordinary: 'Ordinary',
  notable: 'Notable',
  major: 'Major',
  'turning-point': 'Turning point',
};

export default function EventsHeader() {
  const { isDark } = useTheme();
  const categoriesQuery = useCategoriesQuery();
  const locationsQuery = useLocationsQuery();
  const tagsQuery = useTagsQuery();
  const peopleQuery = usePeopleQuery();
  const [query, setQuery] = useState('');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedSignificance, setSelectedSignificance] = useState<string[]>(
    []
  );
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagMatchMode, setTagMatchMode] = useState<MultiValueMatchMode>('all');
  const [selectedPeopleIds, setSelectedPeopleIds] = useState<string[]>([]);
  const [peopleMatchMode, setPeopleMatchMode] =
    useState<MultiValueMatchMode>('all');
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRangeValue>({});
  const [timeRange, setTimeRange] = useState<TimeRangeValue>({});
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
        value={query}
        onChangeText={setQuery}
        placeholder="Search events..."
        autoCorrect={false}
        clearButtonMode="while-editing"
        showClear={query.length > 0 && Platform.OS !== 'ios'}
        clear={() => setQuery('')}
      />
      <ScrollView
        horizontal
        contentContainerStyle={styles.filters}
        showsHorizontalScrollIndicator={false}
      >
        <SearchableMultiSelect
          label="Category"
          options={categoryOptions}
          selectedIds={selectedCategoryIds}
          onChange={setSelectedCategoryIds}
          searchPlaceholder="Search categories..."
          disabled={categoriesQuery.isPending || categoriesQuery.isError}
        />
        <SearchableMultiSelect
          label="Significance"
          options={significanceOptions}
          selectedIds={selectedSignificance}
          onChange={setSelectedSignificance}
          searchPlaceholder="Search significance..."
        />
        <SearchableMultiSelect
          label="Tags"
          options={tagOptions}
          selectedIds={selectedTagIds}
          onChange={setSelectedTagIds}
          matchMode={tagMatchMode}
          onMatchModeChange={setTagMatchMode}
          searchPlaceholder="Search tags..."
          disabled={tagsQuery.isPending || tagsQuery.isError}
        />
        <SearchableMultiSelect
          label="People"
          options={peopleOptions}
          selectedIds={selectedPeopleIds}
          onChange={setSelectedPeopleIds}
          matchMode={peopleMatchMode}
          onMatchModeChange={setPeopleMatchMode}
          searchPlaceholder="Search people..."
          disabled={peopleQuery.isPending || peopleQuery.isError}
        />
        <SearchableMultiSelect
          label="Location"
          options={locationOptions}
          selectedIds={selectedLocationIds}
          onChange={setSelectedLocationIds}
          searchPlaceholder="Search locations..."
          disabled={locationsQuery.isPending || locationsQuery.isError}
        />
        <DateTimeRangeFilter
          mode="date"
          value={dateRange}
          onChange={setDateRange}
        />
        <DateTimeRangeFilter
          mode="time"
          value={timeRange}
          onChange={setTimeRange}
        />
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
});
