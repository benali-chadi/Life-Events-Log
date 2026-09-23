import { elevation, radius, spacing, typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { X } from 'lucide-react-native';
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

type CreatableTokenInputProps = {
  values: SelectOption[];
  options: SelectOption[];

  onChange: (values: SelectOption[]) => void;

  onCreate?: (label: string) => SelectOption | Promise<SelectOption>;
  onCreateError?: (error: unknown) => void;

  placeholder?: string;
  searchPlaceholder?: string;
  emptySuggestionsText?: string;

  prefix?: string;

  disabled?: boolean;
  maxVisibleSuggestions?: number;
  maxVisibleValues?: number;
};

export default function CreatableTokenInput({
  values,
  options,
  onChange,
  onCreate,
  onCreateError,

  placeholder = 'Add a value',
  searchPlaceholder = 'Search or create...',
  emptySuggestionsText,

  prefix = '',
  disabled = false,
  maxVisibleSuggestions = 6,
  maxVisibleValues,
}: CreatableTokenInputProps) {
  const { colors } = useTheme();

  const inputRef = useRef<TextInput>(null);
  const selectingSuggestionRef = useRef(false);
  const creatingOptionRef = useRef(false);

  const [isEditing, setIsEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isCreating, setIsCreating] = useState(false);
  const [valuesExpanded, setValuesExpanded] = useState(false);

  const visibleValues =
    isEditing || valuesExpanded || maxVisibleValues === undefined
      ? values
      : values.slice(0, maxVisibleValues);
  const hiddenValueCount = values.length - visibleValues.length;

  const selectedIds = useMemo(
    () => new Set(values.map((value) => value.id)),
    [values]
  );

  const normalizedQuery = normalizeOptionValue(query);

  const exactMatch = useMemo(() => {
    if (!normalizedQuery) return undefined;

    return options.find(
      (option) =>
        !selectedIds.has(option.id) &&
        normalizeOptionValue(option.label) === normalizedQuery
    );
  }, [normalizedQuery, options, selectedIds]);

  const suggestions = useMemo(() => {
    return filterOptions({
      options,
      query,
      excludedIds: selectedIds,
      limit: maxVisibleSuggestions,
    });
  }, [maxVisibleSuggestions, options, query, selectedIds]);

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
    const subscription = Keyboard.addListener('keyboardDidHide', () => {
      if (!selectingSuggestionRef.current && !creatingOptionRef.current) {
        leaveEditMode();
      }
    });

    return () => subscription.remove();
  }, [leaveEditMode]);

  useEffect(() => {
    if (highlightedIndex >= selectableItemCount) {
      setHighlightedIndex(
        selectableItemCount > 0 ? selectableItemCount - 1 : -1
      );
    }
  }, [highlightedIndex, selectableItemCount]);

  const addOption = useCallback(
    (option: SelectOption) => {
      if (selectedIds.has(option.id)) {
        resetInput();
        return;
      }

      onChange([...values, option]);
      resetInput();

      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    },
    [onChange, resetInput, selectedIds, values]
  );

  const removeOption = useCallback(
    (optionId: string) => {
      onChange(values.filter((value) => value.id !== optionId));

      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    },
    [onChange, values]
  );

  const createOption = useCallback(async () => {
    const trimmedQuery = query.trim();

    if (!trimmedQuery || !onCreate || isCreating) return;

    creatingOptionRef.current = true;
    setIsCreating(true);

    try {
      const createdOption = await onCreate(trimmedQuery);

      addOption(createdOption);
    } catch (error) {
      onCreateError?.(error);
    } finally {
      creatingOptionRef.current = false;
      setIsCreating(false);

      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [addOption, isCreating, onCreate, onCreateError, query]);

  const enterEditMode = useCallback(() => {
    if (disabled) return;

    setIsEditing(true);

    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [disabled]);

  const selectHightlightedItem = useCallback(() => {
    const highlightedSuggestion = suggestions[highlightedIndex];

    if (highlightedSuggestion) {
      addOption(highlightedSuggestion);
      return true;
    }

    if (canCreate && highlightedIndex === suggestions.length) {
      void createOption();
      return true;
    }

    return false;
  }, [addOption, canCreate, createOption, highlightedIndex, suggestions]);

  const submitQuery = useCallback(() => {
    if (selectHightlightedItem()) return;

    if (exactMatch) {
      addOption(exactMatch);
      return;
    }

    if (canCreate) void createOption();
  }, [addOption, canCreate, createOption, exactMatch, selectHightlightedItem]);

  const handleKeyPress = useCallback(
    ({ nativeEvent }: { nativeEvent: { key: string } }) => {
      const { key } = nativeEvent;

      if (key === 'Backspace' && query.length === 0 && values.length > 0) {
        const lastValue = values[values.length - 1];
        if (lastValue) removeOption(lastValue.id);
      }

      if (key === 'ArrowDown') {
        setHighlightedIndex((currentIndex) => {
          if (selectableItemCount === 0) return -1;

          return currentIndex >= selectableItemCount - 1 ? 0 : currentIndex + 1;
        });

        return;
      }

      if (key === 'ArrowUp') {
        setHighlightedIndex((currentIndex) => {
          if (selectableItemCount === 0) return -1;

          return currentIndex <= 0 ? selectableItemCount - 1 : currentIndex - 1;
        });

        return;
      }

      if (key === 'Escape') leaveEditMode();
    },
    [leaveEditMode, query.length, removeOption, selectableItemCount, values]
  );

  const handleBlur = () => {
    // pressing a suggestion can blur the input before its press handler executes
    requestAnimationFrame(() => {
      if (!selectingSuggestionRef.current) {
        leaveEditMode();
      }

      selectingSuggestionRef.current = false;
    });
  };

  const handleSuggestionPress = useCallback(
    (suggestion: SelectOption) => {
      addOption(suggestion);

      selectingSuggestionRef.current = false;

      requestAnimationFrame(() => {
        if (isEditing) {
          inputRef.current?.focus();
        }
      });
    },
    [addOption, isEditing]
  );

  const handleCreatePress = useCallback(async () => {
    await createOption();

    selectingSuggestionRef.current = false;

    requestAnimationFrame(() => {
      if (isEditing) {
        inputRef.current?.focus();
      }
    });
  }, [createOption, isEditing]);

  const hasVisibleSuggestions =
    isEditing &&
    (suggestions.length > 0 || canCreate || Boolean(normalizedQuery));

  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isEditing ? undefined : placeholder}
        disabled={disabled}
        onPress={enterEditMode}
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
        <View style={styles.tokenContainer}>
          {visibleValues.map((value) => (
            <View
              key={value.id}
              style={[
                styles.token,
                {
                  backgroundColor: colors.interactiveMuted,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[styles.tokenLabel, { color: colors.textSecondary }]}
              >
                {prefix}
                {value.label}
              </Text>

              {isEditing && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${value.label}`}
                  hitSlop={spacing[2]}
                  onPress={(event) => {
                    event.stopPropagation();
                    removeOption(value.id);
                  }}
                  style={({ pressed }) => [
                    styles.removeButton,
                    pressed && {
                      backgroundColor: colors.interactivePressed,
                    },
                  ]}
                >
                  <X
                    aria-hidden
                    color={colors.textMuted}
                    size={13}
                    strokeWidth={2}
                  />
                </Pressable>
              )}
            </View>
          ))}

          {!isEditing &&
            maxVisibleValues !== undefined &&
            values.length > maxVisibleValues && (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: valuesExpanded }}
                onPress={(event) => {
                  event.stopPropagation();
                  setValuesExpanded((current) => !current);
                }}
                style={({ pressed }) => [
                  styles.valuesToggle,
                  pressed && { backgroundColor: colors.interactivePressed },
                ]}
              >
                <Text
                  style={[styles.valuesToggleText, { color: colors.textMuted }]}
                >
                  {valuesExpanded ? 'Show less' : `+${hiddenValueCount} more`}
                </Text>
              </Pressable>
            )}

          {isEditing ? (
            <TextInput
              ref={inputRef}
              accessibilityLabel={searchPlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              blurOnSubmit={false}
              editable={!disabled}
              onBlur={handleBlur}
              onChangeText={(value) => {
                if (isCreating) return;

                setQuery(value);
                setHighlightedIndex(-1);
              }}
              onKeyPress={handleKeyPress}
              onSubmitEditing={submitQuery}
              placeholder={values.length === 0 ? searchPlaceholder : ''}
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
              selectionColor={colors.focus}
              style={[styles.textInput, { color: colors.text }]}
              value={query}
            />
          ) : (
            values.length === 0 && (
              <Text style={[styles.placeholder, { color: colors.textMuted }]}>
                {placeholder}
              </Text>
            )
          )}
        </View>
      </Pressable>

      {hasVisibleSuggestions && (
        <View
          style={[
            styles.suggestions,
            elevation.dropdown,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
              shadowColor: colors.shadow,
            },
          ]}
        >
          {suggestions.map((suggestion, index) => {
            const isHighlighted = highlightedIndex === index;

            return (
              <Pressable
                key={suggestion.id}
                accessibilityRole="button"
                onPressIn={() => (selectingSuggestionRef.current = true)}
                onPress={() => {
                  handleSuggestionPress(suggestion);
                }}
                style={({ pressed }) => [
                  styles.suggestionRow,
                  (pressed || isHighlighted) && {
                    backgroundColor: colors.interactiveMuted,
                  },
                ]}
              >
                <Text style={[styles.suggestionText, { color: colors.text }]}>
                  {prefix}
                  {suggestion.label}
                </Text>
              </Pressable>
            );
          })}

          {canCreate && (
            <>
              {suggestions.length > 0 && (
                <View
                  style={[styles.separator, { backgroundColor: colors.border }]}
                />
              )}

              <Pressable
                accessibilityRole="button"
                disabled={isCreating}
                onPressIn={() => (selectingSuggestionRef.current = true)}
                onPress={() => {
                  void handleCreatePress();
                }}
                style={({ pressed }) => [
                  styles.suggestionRow,
                  highlightedIndex === suggestions.length && {
                    backgroundColor: colors.interactiveMuted,
                  },
                  pressed && {
                    backgroundColor: colors.interactivePressed,
                  },
                ]}
              >
                <Text style={[styles.createText, { color: colors.text }]}>
                  {isCreating ? 'Creating...' : `Create "${query.trim()}"`}
                </Text>
              </Pressable>
            </>
          )}

          {suggestions.length === 0 && !canCreate && normalizedQuery && (
            <View style={styles.emptyRow}>
              <Text
                style={[
                  styles.emptyText,
                  {
                    color: colors.textMuted,
                  },
                ]}
              >
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
  root: {
    position: 'relative',
    width: '100%',
  },

  inputSurface: {
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },

  tokenContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing[2],
    minHeight: 26,
  },
  token: {
    minHeight: 26,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingLeft: spacing[2],
    paddingRight: spacing[1],
    paddingVertical: 2,
  },
  tokenLabel: {
    ...typography.small,
    flexShrink: 1,
  },

  removeButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    marginLeft: 2,
  },
  valuesToggle: {
    minHeight: 26,
    justifyContent: 'center',
    borderRadius: radius.sm,
    paddingHorizontal: spacing[2],
  },
  valuesToggleText: { ...typography.caption, fontWeight: '600' },

  textInput: {
    ...typography.small,
    minWidth: 80,
    flexGrow: 1,
    flexShrink: 1,
    padding: 0,
    margin: 0,
  },

  placeholder: {
    ...typography.small,
  },

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
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },

  suggestionText: {
    ...typography.small,
  },

  createText: {
    ...typography.small,
    fontWeight: '500',
  },

  separator: {
    height: StyleSheet.hairlineWidth,
  },

  emptyRow: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  emptyText: {
    ...typography.small,
  },
});
