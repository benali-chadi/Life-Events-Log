import { elevation, radius, spacing, typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { Check, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  filterOptions,
  normalizeOptionValue,
  type SelectOption,
} from './select';

type SingleSelectProps = {
  value: SelectOption | null;
  options: SelectOption[];
  onChange: (value: SelectOption | null) => void;
  onCreate?: (label: string) => SelectOption | Promise<SelectOption>;
  placeholder?: string;
  searchPlaceholder?: string;
  emptySuggestionsText?: string;
  prefix?: string;
  disabled?: boolean;
  clearable?: boolean;
  maxVisibleSuggestions?: number;
};

export default function SingleSelect({
  value,
  options,
  onChange,
  onCreate,
  placeholder = 'Select a value',
  searchPlaceholder = 'Search...',
  emptySuggestionsText = 'No options found',
  prefix = '',
  disabled = false,
  clearable = true,
  maxVisibleSuggestions = 6,
}: SingleSelectProps) {
  const { colors } = useTheme();

  const inputRef = useRef<TextInput>(null);
  const selectingSuggestionRef = useRef(false);

  const [isEditing, setIsEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isCreating, setIsCreating] = useState(false);

  const normalizedQuery = normalizeOptionValue(query);
  const exactMatch = useMemo(
    () =>
      normalizedQuery
        ? options.find(
            (option) => normalizeOptionValue(option.label) === normalizedQuery
          )
        : undefined,
    [normalizedQuery, options]
  );
  const suggestions = useMemo(
    () =>
      filterOptions({
        options,
        query,
        limit: maxVisibleSuggestions,
      }),
    [maxVisibleSuggestions, options, query]
  );
  const canCreate =
    Boolean(onCreate) && Boolean(normalizedQuery) && !exactMatch;
  const selectableItemCount = suggestions.length + (canCreate ? 1 : 0);

  const resetInput = useCallback(() => {
    setQuery('');
    setHighlightedIndex(-1);
  }, []);

  const leaveEditMode = useCallback(() => {
    selectingSuggestionRef.current = false;
    setIsEditing(false);
    resetInput();
    if (inputRef.current?.isFocused()) inputRef.current.blur();
  }, [resetInput]);

  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidHide', leaveEditMode);
    return () => subscription.remove();
  }, [leaveEditMode]);

  useEffect(() => {
    if (highlightedIndex >= selectableItemCount) {
      setHighlightedIndex(selectableItemCount ? selectableItemCount - 1 : -1);
    }
  }, [highlightedIndex, selectableItemCount]);

  const selectOption = useCallback(
    (option: SelectOption) => {
      onChange(option);
      leaveEditMode();
    },
    [leaveEditMode, onChange]
  );

  const createOption = useCallback(async () => {
    const label = query.trim();
    if (!label || !onCreate || isCreating) return;

    setIsCreating(true);
    try {
      selectOption(await onCreate(label));
    } finally {
      setIsCreating(false);
    }
  }, [isCreating, onCreate, query, selectOption]);

  const submitQuery = () => {
    const highlightedSuggestion = suggestions[highlightedIndex];

    if (highlightedSuggestion) {
      selectOption(highlightedSuggestion);
    } else if (canCreate && highlightedIndex === suggestions.length) {
      void createOption();
    } else if (exactMatch) {
      selectOption(exactMatch);
    } else if (canCreate) {
      void createOption();
    }
  };

  const handleKeyPress = ({
    nativeEvent: { key },
  }: {
    nativeEvent: { key: string };
  }) => {
    if (key === 'ArrowDown') {
      setHighlightedIndex((index) =>
        selectableItemCount === 0 || index >= selectableItemCount - 1
          ? selectableItemCount - 1 < 0
            ? -1
            : 0
          : index + 1
      );
    } else if (key === 'ArrowUp') {
      setHighlightedIndex((index) =>
        selectableItemCount === 0
          ? -1
          : index <= 0
            ? selectableItemCount - 1
            : index - 1
      );
    } else if (key === 'Escape') {
      leaveEditMode();
    }
  };

  const hasVisibleSuggestions =
    isEditing &&
    (suggestions.length > 0 || canCreate || Boolean(normalizedQuery));

  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          isEditing ? undefined : `${placeholder}: ${value?.label ?? 'None'}`
        }
        disabled={disabled}
        onPress={() => {
          if (disabled) return;
          setIsEditing(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        style={({ pressed }) => [
          styles.inputSurface,
          {
            backgroundColor: isEditing
              ? colors.interactiveMuted
              : 'transparent',
            borderColor: isEditing ? colors.focus : 'transparent',
            opacity: disabled ? 0.55 : 1,
          },
          pressed && !isEditing && { backgroundColor: colors.interactiveMuted },
        ]}
      >
        {isEditing ? (
          <TextInput
            ref={inputRef}
            accessibilityLabel={searchPlaceholder}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isCreating}
            onBlur={() =>
              requestAnimationFrame(() => {
                if (!selectingSuggestionRef.current) leaveEditMode();
                selectingSuggestionRef.current = false;
              })
            }
            onChangeText={(nextQuery) => {
              setQuery(nextQuery);
              setHighlightedIndex(-1);
            }}
            onKeyPress={handleKeyPress}
            onSubmitEditing={submitQuery}
            placeholder={searchPlaceholder}
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
            selectionColor={colors.focus}
            style={[styles.textInput, { color: colors.text }]}
            value={query}
          />
        ) : (
          <View style={styles.valueRow}>
            <Text
              numberOfLines={1}
              style={[
                styles.valueText,
                { color: value ? colors.textSecondary : colors.textMuted },
              ]}
            >
              {value ? `${prefix}${value.label}` : placeholder}
            </Text>
            {value && clearable && !disabled && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Clear ${value.label}`}
                hitSlop={spacing[2]}
                onPress={(event) => {
                  event.stopPropagation();
                  onChange(null);
                }}
                style={styles.clearButton}
              >
                <X color={colors.textMuted} size={14} strokeWidth={2} />
              </Pressable>
            )}
          </View>
        )}
      </Pressable>

      {hasVisibleSuggestions && (
        <View
          style={[
            styles.suggestions,
            elevation.dropdown,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
              shadowColor: colors.text,
            },
          ]}
        >
          {suggestions.map((suggestion, index) => (
            <Pressable
              key={suggestion.id}
              accessibilityRole="button"
              accessibilityState={{ selected: suggestion.id === value?.id }}
              onPressIn={() => (selectingSuggestionRef.current = true)}
              onPress={() => selectOption(suggestion)}
              style={[
                styles.suggestionRow,
                highlightedIndex === index && {
                  backgroundColor: colors.interactiveMuted,
                },
              ]}
            >
              <Text style={[styles.suggestionText, { color: colors.text }]}>
                {prefix}
                {suggestion.label}
              </Text>
              {suggestion.id === value?.id && (
                <Check color={colors.textSecondary} size={16} strokeWidth={2} />
              )}
            </Pressable>
          ))}
          {canCreate && (
            <Pressable
              accessibilityRole="button"
              disabled={isCreating}
              onPressIn={() => (selectingSuggestionRef.current = true)}
              onPress={() => void createOption()}
              style={[
                styles.suggestionRow,
                highlightedIndex === suggestions.length && {
                  backgroundColor: colors.interactiveMuted,
                },
              ]}
            >
              <Text style={[styles.suggestionText, { color: colors.text }]}>
                {isCreating ? 'Creating...' : `Create "${query.trim()}"`}
              </Text>
            </Pressable>
          )}
          {suggestions.length === 0 && !canCreate && normalizedQuery && (
            <View style={styles.emptyRow}>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                {emptySuggestionsText}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'relative', width: '100%' },
  inputSurface: {
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  valueRow: { minHeight: 26, flexDirection: 'row', alignItems: 'center' },
  valueText: { ...typography.small, flex: 1 },
  clearButton: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInput: { ...typography.small, minHeight: 26, padding: 0, margin: 0 },
  suggestions: {
    width: '100%',
    maxHeight: 280,
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    zIndex: 20,
  },
  suggestionRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  suggestionText: { ...typography.small, flexShrink: 1 },
  emptyRow: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  emptyText: { ...typography.small },
});
