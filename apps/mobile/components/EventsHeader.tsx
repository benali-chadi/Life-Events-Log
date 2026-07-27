import { eventColors, spacing } from '@lel/design';
import React, { useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import SearchableMultiSelect, {
  type MultiSelectOption,
} from './ui/searchable-multi-select/SearchableMultiSelect';
import SearchInput from './ui/SearchInput';

export default function EventsHeader() {
  const [query, setQuery] = useState('');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);

  const categoryOptions: MultiSelectOption[] = [
    {
      id: 'personal',
      label: 'Personal',
      color: eventColors.green.light,
    },
    { id: 'family', label: 'Family', color: eventColors.amber.light },
    { id: 'work', label: 'Work', color: eventColors.blue.light },
    { id: 'travel', label: 'Travel', color: eventColors.rose.light },
  ];

  return (
    <View style={styles.root}>
      <SearchInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search.."

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
        {/* Filters Input */}
        <SearchableMultiSelect
          label="Category"
          options={categoryOptions}
          selectedIds={selectedCategoryIds}
          onChange={setSelectedCategoryIds}
          searchPlaceholder="Search categories..."
        />
        <SearchableMultiSelect
          label="Category"
          options={categoryOptions}
          selectedIds={selectedCategoryIds}
          onChange={setSelectedCategoryIds}
          searchPlaceholder="Search categories..."
        />

        <SearchableMultiSelect
          label="Category"
          options={categoryOptions}
          selectedIds={selectedCategoryIds}
          onChange={setSelectedCategoryIds}
          searchPlaceholder="Search categories..."
        />
        <SearchableMultiSelect
          label="Category"
          options={categoryOptions}
          selectedIds={selectedCategoryIds}
          onChange={setSelectedCategoryIds}
          searchPlaceholder="Search categories..."
        />
        <SearchableMultiSelect
          label="Category"
          options={categoryOptions}
          selectedIds={selectedCategoryIds}
          onChange={setSelectedCategoryIds}
          searchPlaceholder="Search categories..."
        />
        <SearchableMultiSelect
          label="Category"
          options={categoryOptions}
          selectedIds={selectedCategoryIds}
          onChange={setSelectedCategoryIds}
          searchPlaceholder="Search categories..."
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  filters: {
    gap: spacing[2],
  },
});
