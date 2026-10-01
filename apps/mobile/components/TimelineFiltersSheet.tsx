import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { radius, spacing, typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { Check, SlidersHorizontal, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import BottomSheetModal from './ui/BottomSheetModal';
import SearchInput from './ui/SearchInput';
import type {
  MultiSelectOption,
  MultiValueMatchMode,
} from './ui/searchable-multi-select/SearchableMultiSelect';
import type { TimelineFilters } from './EventsHeader';
import type { LocalDate, LocalTime } from '@/models';

export type TimelineFilterSectionId =
  | 'category'
  | 'significance'
  | 'tags'
  | 'people'
  | 'location'
  | 'date'
  | 'time';

type TimelineFiltersSheetProps = {
  categoryOptions: MultiSelectOption[];
  filters: TimelineFilters;
  initialSection?: TimelineFilterSectionId;
  isResultCountFetching: boolean;
  locationOptions: MultiSelectOption[];
  onChange: (filters: TimelineFilters) => void;
  onClear: () => void;
  onRequestClose: () => void;
  peopleOptions: MultiSelectOption[];
  resultCount?: number;
  significanceOptions: MultiSelectOption[];
  tagOptions: MultiSelectOption[];
  visible: boolean;
};

const SECTION_ORDER: TimelineFilterSectionId[] = [
  'category',
  'significance',
  'tags',
  'people',
  'location',
  'date',
  'time',
];
const SELECTED_OPTION_LIMIT = 3;
const SUGGESTION_LIMIT = 6;

export default function TimelineFiltersSheet({
  categoryOptions,
  filters,
  initialSection,
  isResultCountFetching,
  locationOptions,
  onChange,
  onClear,
  onRequestClose,
  peopleOptions,
  resultCount,
  significanceOptions,
  tagOptions,
  visible,
}: TimelineFiltersSheetProps) {
  const { colors } = useTheme();
  const [activeSearchSection, setActiveSearchSection] =
    useState<TimelineFilterSectionId>();
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<
    Partial<Record<TimelineFilterSectionId, number>>
  >({});

  useEffect(() => {
    if (!visible || !initialSection) return;

    const timeout = setTimeout(() => {
      scrollRef.current?.scrollTo({
        animated: false,
        y: Math.max(0, (sectionOffsets.current[initialSection] ?? 0) - 12),
      });
    }, 100);

    return () => clearTimeout(timeout);
  }, [initialSection, visible]);

  useEffect(() => {
    if (!visible) setActiveSearchSection(undefined);
  }, [visible]);

  const selectionCount = countActiveFilterGroups(filters);

  const sectionLayout =
    (section: TimelineFilterSectionId) =>
    (event: { nativeEvent: { layout: { y: number } } }) => {
      sectionOffsets.current[section] = event.nativeEvent.layout.y;
    };

  return (
    <BottomSheetModal
      closeAccessibilityLabel="Close filters"
      onRequestClose={onRequestClose}
      sheetStyle={styles.sheet}
      visible={visible}
    >
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <SlidersHorizontal color={colors.textSecondary} size={19} />
          <Text style={[styles.title, { color: colors.text }]}>Filters</Text>
          {selectionCount > 0 && (
            <Text style={[styles.activeCount, { color: colors.textMuted }]}>
              {selectionCount} active
            </Text>
          )}
        </View>
        <View style={styles.headerActions}>
          {selectionCount > 0 && (
            <Pressable
              accessibilityRole="button"
              onPress={onClear}
              style={({ pressed }) => [
                styles.headerButton,
                pressed && { backgroundColor: colors.interactivePressed },
              ]}
            >
              <Text
                style={[
                  styles.headerButtonText,
                  { color: colors.textSecondary },
                ]}
              >
                Clear all
              </Text>
            </Pressable>
          )}
          <Pressable
            accessibilityLabel="Close filters"
            accessibilityRole="button"
            hitSlop={spacing[2]}
            onPress={onRequestClose}
            style={({ pressed }) => [
              styles.closeButton,
              { backgroundColor: colors.interactiveMuted },
              pressed && { backgroundColor: colors.interactivePressed },
            ]}
          >
            <X color={colors.textSecondary} size={19} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View onLayout={sectionLayout('category')}>
          <InlineMultiSelectSection
            isSearchActive={activeSearchSection === 'category'}
            label="Category"
            onSearchBlur={() =>
              setActiveSearchSection((current) =>
                current === 'category' ? undefined : current
              )
            }
            onSearchFocus={() => setActiveSearchSection('category')}
            options={categoryOptions}
            selectedIds={filters.categoryIds}
            onChange={(categoryIds) => onChange({ ...filters, categoryIds })}
            searchPlaceholder="Search categories…"
          />
        </View>

        <View onLayout={sectionLayout('significance')}>
          <InlineMultiSelectSection
            label="Significance"
            options={significanceOptions}
            selectedIds={filters.significance}
            onChange={(significance) =>
              onChange({
                ...filters,
                significance: significance as TimelineFilters['significance'],
              })
            }
            searchable={false}
          />
        </View>

        <View onLayout={sectionLayout('tags')}>
          <InlineMultiSelectSection
            isSearchActive={activeSearchSection === 'tags'}
            label="Tags"
            matchMode={filters.tagMatchMode}
            onMatchModeChange={(tagMatchMode) =>
              onChange({ ...filters, tagMatchMode })
            }
            onSearchBlur={() =>
              setActiveSearchSection((current) =>
                current === 'tags' ? undefined : current
              )
            }
            onSearchFocus={() => setActiveSearchSection('tags')}
            options={tagOptions}
            selectedIds={filters.tagIds}
            onChange={(tagIds) => onChange({ ...filters, tagIds })}
            searchPlaceholder="Search tags…"
          />
        </View>

        <View onLayout={sectionLayout('people')}>
          <InlineMultiSelectSection
            isSearchActive={activeSearchSection === 'people'}
            label="People"
            matchMode={filters.peopleMatchMode}
            onMatchModeChange={(peopleMatchMode) =>
              onChange({ ...filters, peopleMatchMode })
            }
            onSearchBlur={() =>
              setActiveSearchSection((current) =>
                current === 'people' ? undefined : current
              )
            }
            onSearchFocus={() => setActiveSearchSection('people')}
            options={peopleOptions}
            selectedIds={filters.peopleIds}
            onChange={(peopleIds) => onChange({ ...filters, peopleIds })}
            searchPlaceholder="Search people…"
          />
        </View>

        <View onLayout={sectionLayout('location')}>
          <InlineMultiSelectSection
            isSearchActive={activeSearchSection === 'location'}
            label="Location"
            onSearchBlur={() =>
              setActiveSearchSection((current) =>
                current === 'location' ? undefined : current
              )
            }
            onSearchFocus={() => setActiveSearchSection('location')}
            options={locationOptions}
            selectedIds={filters.locationIds}
            onChange={(locationIds) => onChange({ ...filters, locationIds })}
            searchPlaceholder="Search locations…"
          />
        </View>

        <View onLayout={sectionLayout('date')}>
          <InlineRangeSection
            label="Date"
            mode="date"
            value={filters.dateRange}
            onChange={(dateRange) =>
              onChange({
                ...filters,
                dateRange: dateRange as TimelineFilters['dateRange'],
              })
            }
          />
        </View>

        <View onLayout={sectionLayout('time')}>
          <InlineRangeSection
            label="Time"
            mode="time"
            value={filters.timeRange}
            onChange={(timeRange) =>
              onChange({
                ...filters,
                timeRange: timeRange as TimelineFilters['timeRange'],
              })
            }
          />
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.surfaceElevated,
            borderTopColor: colors.border,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          onPress={onRequestClose}
          style={({ pressed }) => [
            styles.doneButton,
            {
              backgroundColor: pressed ? colors.primaryPressed : colors.primary,
            },
          ]}
        >
          <Text style={[styles.doneText, { color: colors.onPrimary }]}>
            {resultCount === undefined
              ? 'Show events'
              : `Show ${resultCount} ${resultCount === 1 ? 'event' : 'events'}`}
          </Text>
          {isResultCountFetching && resultCount !== undefined && (
            <Text style={[styles.updatingCount, { color: colors.onPrimary }]}>
              Updating…
            </Text>
          )}
        </Pressable>
      </View>
    </BottomSheetModal>
  );
}

type InlineMultiSelectSectionProps = {
  isSearchActive?: boolean;
  label: string;
  matchMode?: MultiValueMatchMode;
  onChange: (selectedIds: string[]) => void;
  onMatchModeChange?: (mode: MultiValueMatchMode) => void;
  onSearchBlur?: () => void;
  onSearchFocus?: () => void;
  options: MultiSelectOption[];
  searchable?: boolean;
  searchPlaceholder?: string;
  selectedIds: string[];
};

function InlineMultiSelectSection({
  isSearchActive = false,
  label,
  matchMode,
  onChange,
  onMatchModeChange,
  onSearchBlur,
  onSearchFocus,
  options,
  searchable = true,
  searchPlaceholder = 'Search…',
  selectedIds,
}: InlineMultiSelectSectionProps) {
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [selectedExpanded, setSelectedExpanded] = useState(false);
  const selectingSuggestion = useRef(false);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedOptions = useMemo(
    () => options.filter((option) => selectedSet.has(option.id)),
    [options, selectedSet]
  );
  const visibleSelectedOptions = selectedExpanded
    ? selectedOptions
    : selectedOptions.slice(0, SELECTED_OPTION_LIMIT);
  const suggestions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const matches = options.filter(
      (option) =>
        !selectedSet.has(option.id) &&
        (!query ||
          option.label.toLocaleLowerCase().includes(query) ||
          option.description?.toLocaleLowerCase().includes(query))
    );

    return [...matches]
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return a.label.localeCompare(b.label);
      })
      .slice(0, SUGGESTION_LIMIT);
  }, [options, search, selectedSet]);

  const select = (id: string) => {
    onChange([...selectedIds, id]);
    setSearch('');
    requestAnimationFrame(() => {
      selectingSuggestion.current = false;
    });
  };

  const remove = (id: string) =>
    onChange(selectedIds.filter((selectedId) => selectedId !== id));

  return (
    <View style={[styles.section, { borderBottomColor: colors.border }]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {label}
          </Text>
          {selectedIds.length > 0 && (
            <Text style={[styles.sectionCount, { color: colors.textMuted }]}>
              {selectedIds.length} selected
            </Text>
          )}
        </View>
        {selectedIds.length > 0 && (
          <Pressable
            accessibilityRole="button"
            onPress={() => onChange([])}
            style={({ pressed }) => [
              styles.clearSection,
              pressed && { backgroundColor: colors.interactivePressed },
            ]}
          >
            <Text
              style={[styles.clearSectionText, { color: colors.textSecondary }]}
            >
              Clear
            </Text>
          </Pressable>
        )}
      </View>

      {matchMode && onMatchModeChange && selectedIds.length > 1 && (
        <View style={styles.matchRow}>
          <Text style={[styles.matchLabel, { color: colors.textMuted }]}>
            Match
          </Text>
          <View
            style={[
              styles.segmented,
              { backgroundColor: colors.interactiveMuted },
            ]}
          >
            {(['all', 'any'] as const).map((mode) => {
              const selected = matchMode === mode;
              return (
                <Pressable
                  key={mode}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => onMatchModeChange(mode)}
                  style={[
                    styles.segment,
                    selected && { backgroundColor: colors.surfaceElevated },
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      { color: selected ? colors.text : colors.textMuted },
                    ]}
                  >
                    {mode === 'all' ? 'All' : 'Any'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {searchable ? (
        <>
          {selectedOptions.length > 0 && (
            <View style={styles.options}>
              {visibleSelectedOptions.map((option) => (
                <Pressable
                  key={option.id}
                  accessibilityLabel={`Remove ${option.label}`}
                  accessibilityRole="button"
                  onPress={() => remove(option.id)}
                  style={({ pressed }) => [
                    styles.option,
                    {
                      backgroundColor: colors.primary,
                      borderColor: colors.primary,
                    },
                    pressed && { backgroundColor: colors.primaryPressed },
                  ]}
                >
                  {option.color && (
                    <View
                      style={[
                        styles.optionColor,
                        { backgroundColor: option.color },
                      ]}
                    />
                  )}
                  <Text
                    style={[styles.optionText, { color: colors.onPrimary }]}
                  >
                    {option.label}
                  </Text>
                  <X color={colors.onPrimary} size={14} strokeWidth={2.25} />
                </Pressable>
              ))}
              {selectedOptions.length > SELECTED_OPTION_LIMIT && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: selectedExpanded }}
                  onPress={() => setSelectedExpanded((current) => !current)}
                  style={({ pressed }) => [
                    styles.optionToggle,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                    pressed && { backgroundColor: colors.interactivePressed },
                  ]}
                >
                  <Text
                    style={[
                      styles.optionToggleText,
                      { color: colors.textMuted },
                    ]}
                  >
                    {selectedExpanded
                      ? 'Show less'
                      : `+${selectedOptions.length - SELECTED_OPTION_LIMIT} more`}
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          <SearchInput
            autoCorrect={false}
            blurOnKeyboardHide
            clear={() => setSearch('')}
            clearButtonMode="while-editing"
            containerStyle={styles.sectionSearch}
            onBlur={() =>
              requestAnimationFrame(() => {
                if (!selectingSuggestion.current) {
                  onSearchBlur?.();
                }
                selectingSuggestion.current = false;
              })
            }
            onChangeText={setSearch}
            onFocus={onSearchFocus}
            placeholder={searchPlaceholder}
            showClear={search.length > 0 && Platform.OS !== 'ios'}
            value={search}
          />

          {isSearchActive && (
            <View style={styles.suggestions}>
              {suggestions.map((option) => (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  onPressIn={() => {
                    selectingSuggestion.current = true;
                  }}
                  onPress={() => select(option.id)}
                  style={({ pressed }) => [
                    styles.suggestion,
                    { borderBottomColor: colors.border },
                    pressed && { backgroundColor: colors.interactivePressed },
                  ]}
                >
                  {option.color && (
                    <View
                      style={[
                        styles.optionColor,
                        { backgroundColor: option.color },
                      ]}
                    />
                  )}
                  <View style={styles.suggestionText}>
                    <Text
                      style={[
                        styles.optionText,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {option.label}
                    </Text>
                    {option.description && (
                      <Text
                        style={[
                          styles.suggestionDescription,
                          { color: colors.textMuted },
                        ]}
                      >
                        {option.description}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.addText, { color: colors.primary }]}>
                    Add
                  </Text>
                </Pressable>
              ))}
              {suggestions.length === 0 && (
                <Text style={[styles.noOptions, { color: colors.textMuted }]}>
                  No options found
                </Text>
              )}
            </View>
          )}
        </>
      ) : (
        <View style={styles.options}>
          {options.map((option) => {
            const selected = selectedSet.has(option.id);
            return (
              <Pressable
                key={option.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                onPress={() =>
                  selected ? remove(option.id) : select(option.id)
                }
                style={({ pressed }) => [
                  styles.option,
                  {
                    backgroundColor: selected ? colors.primary : colors.surface,
                    borderColor: selected ? colors.primary : colors.border,
                  },
                  pressed && {
                    backgroundColor: selected
                      ? colors.primaryPressed
                      : colors.interactivePressed,
                  },
                ]}
              >
                {option.color && (
                  <View
                    style={[
                      styles.optionColor,
                      { backgroundColor: option.color },
                    ]}
                  />
                )}
                {selected && (
                  <Check color={colors.onPrimary} size={14} strokeWidth={2.5} />
                )}
                <Text
                  style={[
                    styles.optionText,
                    {
                      color: selected ? colors.onPrimary : colors.textSecondary,
                    },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

type RangeValue = { from?: LocalDate | LocalTime; to?: LocalDate | LocalTime };

function InlineRangeSection({
  label,
  mode,
  onChange,
  value,
}: {
  label: string;
  mode: 'date' | 'time';
  onChange: (value: RangeValue) => void;
  value: RangeValue;
}) {
  const { colors } = useTheme();
  const [iosEndpoint, setIosEndpoint] = useState<'from' | 'to' | null>(null);

  const selectEndpoint = (endpoint: 'from' | 'to') => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        mode,
        is24Hour: true,
        value: initialPickerValue(mode, endpoint, value),
        maximumDate:
          mode === 'date' && endpoint === 'from' && value.to
            ? parsePickerValue(mode, value.to)
            : undefined,
        minimumDate:
          mode === 'date' && endpoint === 'to' && value.from
            ? parsePickerValue(mode, value.from)
            : undefined,
        onChange: (event, date) => {
          if (event.type === 'set' && date) {
            onChange({
              ...value,
              [endpoint]: formatPickerValue(mode, date),
            });
          }
        },
      });
      return;
    }

    setIosEndpoint((current) => (current === endpoint ? null : endpoint));
  };

  const handleIosChange = (event: DateTimePickerEvent, date?: Date) => {
    if (!iosEndpoint || event.type === 'dismissed' || !date) return;
    onChange({
      ...value,
      [iosEndpoint]: formatPickerValue(mode, date),
    });
  };

  return (
    <View style={[styles.section, { borderBottomColor: colors.border }]}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {label}
        </Text>
        {(value.from || value.to) && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setIosEndpoint(null);
              onChange({});
            }}
            style={({ pressed }) => [
              styles.clearSection,
              pressed && { backgroundColor: colors.interactivePressed },
            ]}
          >
            <Text
              style={[styles.clearSectionText, { color: colors.textSecondary }]}
            >
              Clear
            </Text>
          </Pressable>
        )}
      </View>

      <View style={styles.rangeControls}>
        {(['from', 'to'] as const).map((endpoint) => (
          <Pressable
            key={endpoint}
            accessibilityRole="button"
            onPress={() => selectEndpoint(endpoint)}
            style={({ pressed }) => [
              styles.rangeControl,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed && { backgroundColor: colors.interactivePressed },
            ]}
          >
            <Text style={[styles.rangeLabel, { color: colors.textMuted }]}>
              {endpoint === 'from' ? 'From' : 'To'}
            </Text>
            <Text style={[styles.rangeValue, { color: colors.text }]}>
              {displayRangeValue(mode, value[endpoint])}
            </Text>
          </Pressable>
        ))}
      </View>

      {Platform.OS === 'ios' && iosEndpoint && (
        <View style={[styles.iosPicker, { borderTopColor: colors.border }]}>
          <DateTimePicker
            display={mode === 'date' ? 'inline' : 'spinner'}
            is24Hour
            mode={mode}
            onChange={handleIosChange}
            value={initialPickerValue(mode, iosEndpoint, value)}
            maximumDate={
              mode === 'date' && iosEndpoint === 'from' && value.to
                ? parsePickerValue(mode, value.to)
                : undefined
            }
            minimumDate={
              mode === 'date' && iosEndpoint === 'to' && value.from
                ? parsePickerValue(mode, value.from)
                : undefined
            }
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => setIosEndpoint(null)}
            style={styles.pickerDone}
          >
            <Text style={[styles.pickerDoneText, { color: colors.primary }]}>
              Done
            </Text>
          </Pressable>
        </View>
      )}

      {mode === 'time' && value.from && value.to && value.from > value.to && (
        <Text style={[styles.rangeHint, { color: colors.textMuted }]}>
          Overnight range: it continues past midnight.
        </Text>
      )}
    </View>
  );
}

export function countActiveFilterGroups(filters: TimelineFilters) {
  return SECTION_ORDER.reduce(
    (count, section) => count + Number(isSectionActive(filters, section)),
    0
  );
}

function isSectionActive(
  filters: TimelineFilters,
  section: TimelineFilterSectionId
) {
  if (section === 'category') return filters.categoryIds.length > 0;
  if (section === 'significance') return filters.significance.length > 0;
  if (section === 'tags') return filters.tagIds.length > 0;
  if (section === 'people') return filters.peopleIds.length > 0;
  if (section === 'location') return filters.locationIds.length > 0;
  if (section === 'date')
    return Boolean(filters.dateRange.from || filters.dateRange.to);
  return Boolean(filters.timeRange.from || filters.timeRange.to);
}

const pad = (value: number) => String(value).padStart(2, '0');

function formatPickerValue(mode: 'date' | 'time', date: Date) {
  return mode === 'date'
    ? (`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` as LocalDate)
    : (`${pad(date.getHours())}:${pad(date.getMinutes())}` as LocalTime);
}

function parsePickerValue(mode: 'date' | 'time', value: string) {
  const now = new Date();
  if (mode === 'date') {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year ?? now.getFullYear(), (month ?? 1) - 1, day ?? 1, 12);
  }
  const [hours, minutes] = value.split(':').map(Number);
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hours ?? 0,
    minutes ?? 0
  );
}

function initialPickerValue(
  mode: 'date' | 'time',
  endpoint: 'from' | 'to',
  value: RangeValue
) {
  return value[endpoint] ? parsePickerValue(mode, value[endpoint]) : new Date();
}

function displayRangeValue(mode: 'date' | 'time', value?: string) {
  if (!value) return 'Not set';
  if (mode === 'time') return value;
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parsePickerValue(mode, value));
}

const styles = StyleSheet.create({
  sheet: { height: '92%' },
  header: {
    minHeight: 52,
    paddingHorizontal: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  title: { ...typography.h3, fontSize: 22, lineHeight: 30, fontWeight: '500' },
  activeCount: { ...typography.caption },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  headerButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing[2],
    borderRadius: radius.sm,
  },
  headerButtonText: { ...typography.small, fontWeight: '600' },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  content: { paddingHorizontal: spacing[4], paddingBottom: spacing[8] },
  section: {
    paddingVertical: spacing[4],
    gap: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionHeader: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing[2],
  },
  sectionTitle: { ...typography.small, fontWeight: '600' },
  sectionCount: { ...typography.caption },
  clearSection: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing[2],
    borderRadius: radius.sm,
  },
  clearSectionText: { ...typography.small, fontWeight: '600' },
  sectionSearch: { marginHorizontal: 0, marginBottom: 0 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  option: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[3],
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  optionColor: { width: 9, height: 9, borderRadius: 5 },
  optionText: { ...typography.small, fontWeight: '500' },
  optionToggle: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  optionToggleText: { ...typography.caption, fontWeight: '600' },
  suggestions: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  suggestion: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  suggestionText: { flex: 1 },
  suggestionDescription: { ...typography.caption },
  addText: { ...typography.caption, fontWeight: '700' },
  noOptions: { ...typography.small, paddingVertical: spacing[2] },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  matchLabel: { ...typography.small },
  segmented: { flexDirection: 'row', padding: 2, borderRadius: radius.md },
  segment: {
    minWidth: 56,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  segmentText: { ...typography.caption },
  rangeControls: { flexDirection: 'row', gap: spacing[2] },
  rangeControl: {
    flex: 1,
    minHeight: 64,
    justifyContent: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[3],
    borderWidth: 1,
    borderRadius: radius.md,
  },
  rangeLabel: { ...typography.caption },
  rangeValue: { ...typography.small, fontWeight: '600' },
  iosPicker: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing[2],
  },
  pickerDone: {
    minHeight: 40,
    alignSelf: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  pickerDoneText: { ...typography.small, fontWeight: '700' },
  rangeHint: { ...typography.caption },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[5],
  },
  doneButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  doneText: { ...typography.small, fontWeight: '700' },
  updatingCount: {
    ...typography.caption,
    marginLeft: spacing[2],
    opacity: 0.72,
  },
});
