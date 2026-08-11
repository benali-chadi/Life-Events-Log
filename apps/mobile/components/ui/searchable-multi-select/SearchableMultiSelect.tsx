import React, { useMemo, useState } from 'react';
import {
  Pressable,
  Text,
  View,
  Modal,
  KeyboardAvoidingView,
  Platform,
  FlatList,
} from 'react-native';
import { ChevronDown, X, Search, Check } from 'lucide-react-native';
import { createStyles } from './helpers';
import { useTheme } from '@lel/design/useTheme';
import { spacing } from '@lel/design';
import SearchInput from '../SearchInput';

export type MultiSelectOption = {
  id: string;
  label: string;

  color?: string;

  description?: string;

  pinned?: boolean;
};

type SearchableMultiSelectProps = {
  label: string;
  options: MultiSelectOption[];

  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;

  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;

  applyImmediately?: boolean; // by default slections are only commited when the user clicks apply
};

export default function SearchableMultiSelect({
  label,
  options,

  selectedIds,
  onChange,

  placeholder = 'All',
  searchPlaceholder = 'Search options...',
  emptyMessage = 'No options found',
  disabled = false,

  applyImmediately = false,
}: SearchableMultiSelectProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [draftSelectedIds, setDraftSelectedIds] = useState(selectedIds);

  const draftSelectedSet = useMemo(
    () => new Set(draftSelectedIds),
    [draftSelectedIds]
  );

  const selectedOptions = useMemo(() => {
    const selectedSet = new Set(selectedIds);

    return options.filter((option) => selectedSet.has(option.id));
  }, [options, selectedIds]);

  const filteredOptions = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();

    const matchingOptions = query
      ? options.filter((option) => {
          const matchesLabel = option.label.toLocaleLowerCase().includes(query);

          const matchesDescription = option.description
            ?.toLocaleLowerCase()
            .includes(query);

          return matchesLabel || matchesDescription;
        })
      : options;

    return [...matchingOptions].sort((a, b) => {
      if (a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1;
      }

      const aIsSelected = draftSelectedSet.has(a.id);
      const bIsSelected = draftSelectedSet.has(b.id);

      if (aIsSelected !== bIsSelected) {
        return aIsSelected ? -1 : 1;
      }

      return a.label.localeCompare(b.label);
    });
  }, [options, searchQuery, draftSelectedSet]);

  const selectionSummary = useMemo(() => {
    if (selectedOptions.length === 0) {
      return placeholder;
    }

    if (selectedOptions.length === 1) {
      return selectedOptions[0]?.label ?? placeholder;
    }

    return `${selectedOptions.length} selected`;
  }, [placeholder, selectedOptions]);

  const openMenu = () => {
    if (disabled) return;

    setDraftSelectedIds(selectedIds);
    setSearchQuery('');
    setIsOpen(true);
  };

  const closeMenu = () => {
    setIsOpen(false);
    setSearchQuery('');
  };

  const cancelChanges = () => {
    setDraftSelectedIds(selectedIds);
    closeMenu();
  };

  const toggleOption = (optionId: string) => {
    const nextSelectedIds = draftSelectedSet.has(optionId)
      ? draftSelectedIds.filter((id) => id !== optionId)
      : [...draftSelectedIds, optionId];

    setDraftSelectedIds(nextSelectedIds);

    if (applyImmediately) {
      onChange(nextSelectedIds);
    }
  };

  const clearSelection = () => {
    setDraftSelectedIds([]);

    if (applyImmediately) {
      onChange([]);
    }
  };

  const applySelection = () => {
    onChange(draftSelectedIds);
    closeMenu();
  };

  const hasSelection = selectedIds.length > 0;
  const hasDraftSelection = draftSelectedIds.length > 0;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selectionSummary}`}
        accessibilityState={{ expanded: isOpen }}
        disabled={disabled}
        onPress={openMenu}
        style={({ pressed }) => [
          styles.trigger,
          selectedIds.length > 0 && styles.triggerActive,
          disabled && styles.triggerDisabled,
          pressed &&
            !disabled && {
              backgroundColor: colors.interactivePressed,
            },
        ]}
      >
        <View style={styles.triggerContent}>
          <Text
            numberOfLines={1}
            style={[
              styles.triggerLabel,
              hasSelection && styles.triggerLabelActive,
            ]}
          >
            {label}
          </Text>

          {hasSelection && (
            <View style={styles.selectionCount}>
              <Text style={styles.selectionCountText}>
                {selectedIds.length}
              </Text>
            </View>
          )}
        </View>

        <ChevronDown
          size={16}
          strokeWidth={2}
          color={hasSelection ? colors.text : colors.textSecondary}
        />
      </Pressable>

      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={cancelChanges}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalRoot}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close filter"
            onPress={cancelChanges}
            style={styles.backdrop}
          />

          {/* TODO: maybe add Safe area view */}
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />

            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.title}>{label}</Text>

                <Text style={styles.subtitle}>
                  {hasDraftSelection
                    ? `${draftSelectedIds.length} selected`
                    : 'No options selected'}
                </Text>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  hitSlop={spacing[2]}
                  onPress={cancelChanges}
                  style={({ pressed }) => [
                    styles.iconButton,
                    pressed && styles.iconButtonPressed,
                  ]}
                >
                  <X size={20} strokeWidth={2} color={colors.textSecondary} />
                </Pressable>
              </View>
            </View>

            <SearchInput
              autoFocus
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={searchPlaceholder}
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
              showClear={searchQuery.length > 0 && Platform.OS !== 'ios'}
              clear={() => setSearchQuery('')}
            />

            <FlatList
              data={filteredOptions}
              keyExtractor={(option) => option.id}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                styles.listContent,
                filteredOptions.length === 0 && styles.emptyListContent,
              ]}
              ItemSeparatorComponent={() => (
                <View style={styles.optionSeparator} />
              )}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Search
                    size={24}
                    strokeWidth={1.75}
                    color={colors.textMuted}
                  />

                  <Text style={styles.emptyText}>{emptyMessage}</Text>
                </View>
              }
              renderItem={({ item }) => {
                const isSelected = draftSelectedSet.has(item.id);

                return (
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isSelected }}
                    onPress={() => toggleOption(item.id)}
                    style={({ pressed }) => [
                      styles.option,
                      isSelected && styles.optionSelected,
                      pressed && styles.optionPressed,
                    ]}
                  >
                    <View
                      style={[
                        styles.checkIndicator,
                        isSelected && styles.checkIndicatorSelected,
                      ]}
                    >
                      {isSelected && (
                        <Check
                          size={15}
                          strokeWidth={2.5}
                          color={colors.text}
                        />
                      )}
                    </View>

                    <View style={styles.optionContent}>
                      {item.color && (
                        <View
                          style={[
                            styles.colorIndicator,
                            {
                              backgroundColor: item.color,
                            },
                          ]}
                        />
                      )}

                      <View style={styles.optionText}>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.optionLabel,
                            isSelected && styles.optionLabelSelected,
                          ]}
                        >
                          {item.label}
                        </Text>

                        {item.description && (
                          <Text
                            numberOfLines={1}
                            style={styles.optionDescription}
                          >
                            {item.description}
                          </Text>
                        )}
                      </View>
                    </View>
                  </Pressable>
                );
              }}
            />

            <View style={styles.footer}>
              <Pressable
                accessibilityRole="button"
                disabled={!hasDraftSelection}
                onPress={clearSelection}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  !hasDraftSelection && styles.secondaryButtonDisabled,
                  pressed && hasDraftSelection && styles.secondaryButtonPressed,
                ]}
              >
                <Text
                  style={[
                    styles.secondaryButtonText,
                    !hasDraftSelection && styles.secondaryButtonTextDisabled,
                  ]}
                >
                  Clear
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={applyImmediately ? closeMenu : applySelection}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.primaryButtonPressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {applyImmediately
                    ? 'Done'
                    : hasDraftSelection
                      ? `Apply · ${draftSelectedIds.length} `
                      : 'Apply'}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
