import { eventColors, radius, spacing, typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import type { UseQueryResult } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Plus,
  Trash2,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  useCategoriesQuery,
  useCategoriesWithUsageQuery,
  useCreateCategoryMutation,
  useCreateLocationMutation,
  useCreatePersonMutation,
  useCreateTagMutation,
  useLocationsWithUsageQuery,
  usePeopleWithUsageQuery,
  useTagsWithUsageQuery,
  useUpdateCategoryMutation,
  useUpdateLocationMutation,
  useUpdatePersonMutation,
  useUpdateTagMutation,
} from '@/data/query';
import type { MetadataUsageItem } from '@/data/repositories';
import type { Category, CategoryColor, Location, Person, Tag } from '@/models';
import CategoryCreationSheet from '../metadata/CategoryCreationSheet';
import { suggestCategoryColor } from '../metadata/suggestCategoryColor';
import SearchInput from '../ui/SearchInput';
import { normalizeOptionValue } from '../ui/select';
import SwipeReveal, { closeOpenSwipe } from '../ui/SwipeReveal';
import {
  type MetadataDeletionKind,
  useMetadataDeletion,
} from './MetadataDeletionProvider';
import type { MetadataSectionId } from './MetadataTabs';
import NamedMetadataEditSheet from './NamedMetadataEditSheet';

export type MetadataUsageOrder = 'most' | 'least';

type UsageEntity = Category | Tag | Person | Location;

type MetadataUsageSectionProps = {
  section: MetadataSectionId;
  search: string;
  usageOrder: MetadataUsageOrder;
  onSearchChange: (search: string) => void;
  onUsageOrderChange: (order: MetadataUsageOrder) => void;
};

type SectionContentProps = Omit<MetadataUsageSectionProps, 'section'>;

type MetadataUsageListProps<TEntity extends UsageEntity> =
  SectionContentProps & {
    label: string;
    singularLabel: string;
    kind: MetadataDeletionKind;
    query: UseQueryResult<MetadataUsageItem<TEntity>[]>;
    getColor?: (entity: TEntity) => CategoryColor;
    isCreating: boolean;
    creationError: string | null;
    onCreate: (name: string) => void;
    onEdit: (item: MetadataUsageItem<TEntity>) => void;
  };

function queryInput(search: string) {
  const normalizedSearch = search.trim();
  return normalizedSearch ? { search: normalizedSearch } : undefined;
}

function usageLabel(eventCount: number) {
  if (eventCount === 0) return 'Unused';
  return `${eventCount} ${eventCount === 1 ? 'event' : 'events'}`;
}

function MetadataUsageList<TEntity extends UsageEntity>({
  label,
  singularLabel,
  kind,
  search,
  usageOrder,
  onSearchChange,
  onUsageOrderChange,
  query,
  getColor,
  isCreating,
  creationError,
  onCreate,
  onEdit,
}: MetadataUsageListProps<TEntity>) {
  const { colors, isDark } = useTheme();
  const { pending, requestDeletion } = useMetadataDeletion();
  const normalizedSearch = normalizeOptionValue(search);
  const data = useMemo(
    () =>
      [...(query.data ?? [])].sort(
        (left, right) =>
          (usageOrder === 'most'
            ? right.eventCount - left.eventCount
            : left.eventCount - right.eventCount) ||
          left.metadata.name.localeCompare(right.metadata.name, undefined, {
            sensitivity: 'base',
          })
      ),
    [query.data, usageOrder]
  );
  const hasExactMatch = data.some(
    (item) => normalizeOptionValue(item.metadata.name) === normalizedSearch
  );
  const canCreate =
    Boolean(normalizedSearch) &&
    !hasExactMatch &&
    !query.isPending &&
    !query.isError;
  const resultCount = `${data.length} ${
    data.length === 1 ? singularLabel.toLowerCase() : label.toLowerCase()
  }`;
  const create = () => {
    if (canCreate && !isCreating) onCreate(search.trim());
  };

  return (
    <View style={styles.root}>
      <SearchInput
        accessibilityLabel={`Search or create ${label.toLowerCase()}`}
        autoCapitalize="none"
        autoCorrect={false}
        clear={() => onSearchChange('')}
        clearButtonMode="while-editing"
        onChangeText={onSearchChange}
        onFocus={closeOpenSwipe}
        onSubmitEditing={create}
        placeholder={`Search or create ${label.toLowerCase()}...`}
        returnKeyType={canCreate ? 'done' : 'search'}
        showClear={search.length > 0 && Platform.OS !== 'ios'}
        value={search}
      />

      {canCreate && (
        <Pressable
          accessibilityRole="button"
          disabled={isCreating}
          onPress={() => {
            closeOpenSwipe();
            create();
          }}
          style={({ pressed }) => [
            styles.createRow,
            {
              backgroundColor: pressed
                ? colors.interactivePressed
                : colors.interactiveMuted,
            },
          ]}
        >
          {isCreating ? (
            <ActivityIndicator color={colors.textSecondary} size="small" />
          ) : (
            <Plus color={colors.textSecondary} size={18} strokeWidth={2} />
          )}
          <Text style={[styles.createText, { color: colors.text }]}>
            {isCreating
              ? `Creating ${singularLabel.toLowerCase()}…`
              : `Create ${singularLabel.toLowerCase()} “${search.trim()}”`}
          </Text>
        </Pressable>
      )}

      {creationError && (
        <Text
          accessibilityRole="alert"
          style={[styles.creationError, { color: colors.destructive }]}
        >
          {creationError}
        </Text>
      )}

      {!query.isPending && !query.isError && (
        <View style={styles.toolbar}>
          <Text style={[styles.resultCount, { color: colors.textMuted }]}>
            {resultCount}
          </Text>
          <Pressable
            accessibilityLabel={`Sort by ${
              usageOrder === 'most' ? 'least' : 'most'
            } used`}
            accessibilityRole="button"
            onPress={() => {
              closeOpenSwipe();
              onUsageOrderChange(usageOrder === 'most' ? 'least' : 'most');
            }}
            style={({ pressed }) => [
              styles.sortButton,
              pressed && { backgroundColor: colors.interactiveMuted },
            ]}
          >
            <Text style={[styles.sortText, { color: colors.textSecondary }]}>
              {usageOrder === 'most' ? 'Most used' : 'Least used'}
            </Text>
            {usageOrder === 'most' ? (
              <ArrowDown
                color={colors.textSecondary}
                size={15}
                strokeWidth={2}
              />
            ) : (
              <ArrowUp color={colors.textSecondary} size={15} strokeWidth={2} />
            )}
          </Pressable>
        </View>
      )}

      {query.isPending ? (
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.stateText, { color: colors.textMuted }]}>
            Loading {label.toLowerCase()}…
          </Text>
        </View>
      ) : query.isError ? (
        <View style={styles.state}>
          <Text style={[styles.stateTitle, { color: colors.text }]}>
            Couldn’t load {label.toLowerCase()}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void query.refetch()}
            style={({ pressed }) => [
              styles.retryButton,
              {
                backgroundColor: pressed
                  ? colors.primaryPressed
                  : colors.primary,
              },
            ]}
          >
            <Text style={[styles.retryText, { color: colors.onPrimary }]}>
              Retry
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={data}
          contentContainerStyle={[
            styles.listContent,
            data.length === 0 && styles.emptyListContent,
          ]}
          ItemSeparatorComponent={() => (
            <View
              style={[styles.separator, { backgroundColor: colors.border }]}
            />
          )}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.metadata.id}
          onRefresh={() => void query.refetch()}
          onScrollBeginDrag={closeOpenSwipe}
          refreshing={query.isRefetching}
          renderItem={({ item }) => {
            const color = getColor?.(item.metadata);
            const count = usageLabel(item.eventCount);
            const isPendingDeletion =
              pending?.kind === kind && pending.id === item.metadata.id;
            const deletion = {
              kind,
              id: item.metadata.id,
              name: item.metadata.name,
              eventCount: item.eventCount,
            };

            const row = isPendingDeletion ? (
              <View
                accessibilityLabel={`${item.metadata.name}, pending deletion`}
                accessibilityState={{ disabled: true }}
                style={[
                  styles.row,
                  styles.pendingRow,
                  { backgroundColor: colors.bg },
                ]}
              >
                <View style={styles.rowMain}>
                  {color && (
                    <View
                      style={[
                        styles.colorMarker,
                        {
                          backgroundColor:
                            eventColors[color][isDark ? 'dark' : 'light'],
                        },
                      ]}
                    />
                  )}
                  <Text
                    numberOfLines={1}
                    style={[styles.name, { color: colors.textMuted }]}
                  >
                    {item.metadata.name}
                  </Text>
                </View>
                <Text style={[styles.usage, { color: colors.destructive }]}>
                  Pending deletion
                </Text>
              </View>
            ) : (
              <Pressable
                accessibilityLabel={`Edit ${item.metadata.name}, ${count}`}
                accessibilityRole="button"
                onPress={() => {
                  if (closeOpenSwipe()) return;
                  onEdit(item);
                }}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: colors.bg },
                  pressed && { backgroundColor: colors.interactiveMuted },
                ]}
              >
                <View style={styles.rowMain}>
                  {color && (
                    <View
                      style={[
                        styles.colorMarker,
                        {
                          backgroundColor:
                            eventColors[color][isDark ? 'dark' : 'light'],
                        },
                      ]}
                    />
                  )}
                  <Text
                    numberOfLines={1}
                    style={[styles.name, { color: colors.text }]}
                  >
                    {item.metadata.name}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.usage,
                    {
                      color:
                        item.eventCount === 0
                          ? colors.textMuted
                          : colors.textSecondary,
                    },
                  ]}
                >
                  {count}
                </Text>
                <ChevronRight
                  color={colors.textMuted}
                  size={17}
                  strokeWidth={2}
                />
              </Pressable>
            );

            if (isPendingDeletion) return row;

            return (
              <SwipeReveal
                actionWidth={80}
                action={
                  <Pressable
                    accessibilityLabel={`Delete ${item.metadata.name}`}
                    accessibilityRole="button"
                    onPress={() => requestDeletion(deletion)}
                    style={({ pressed }) => [
                      styles.deleteAction,
                      {
                        backgroundColor: pressed
                          ? colors.destructiveSurfacePressed
                          : colors.destructiveSurface,
                      },
                    ]}
                  >
                    <Trash2
                      color={colors.onDestructive}
                      size={18}
                      strokeWidth={2}
                    />
                    <Text
                      style={[
                        styles.deleteActionText,
                        { color: colors.onDestructive },
                      ]}
                    >
                      Delete
                    </Text>
                  </Pressable>
                }
              >
                {row}
              </SwipeReveal>
            );
          }}
          ListEmptyComponent={
            <View style={styles.state}>
              <Text style={[styles.stateTitle, { color: colors.text }]}>
                {normalizedSearch
                  ? `No ${label.toLowerCase()} found`
                  : `No ${label.toLowerCase()} yet`}
              </Text>
              {normalizedSearch && (
                <Text style={[styles.stateText, { color: colors.textMuted }]}>
                  Create the first exact match or try a different search.
                </Text>
              )}
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

function CategoriesSection(props: SectionContentProps) {
  const { requestDeletion } = useMetadataDeletion();
  const input = useMemo(() => queryInput(props.search), [props.search]);
  const query = useCategoriesWithUsageQuery(input);
  const categoriesQuery = useCategoriesQuery();
  const createCategory = useCreateCategoryMutation();
  const updateCategory = useUpdateCategoryMutation();
  const [creationName, setCreationName] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] =
    useState<MetadataUsageItem<Category> | null>(null);

  return (
    <>
      <MetadataUsageList
        {...props}
        creationError={null}
        getColor={(category) => category.color}
        isCreating={false}
        kind="category"
        label="Categories"
        onCreate={(name) => {
          createCategory.reset();
          setCreationName(name);
        }}
        onEdit={(item) => {
          updateCategory.reset();
          setEditingCategory(item);
        }}
        query={query}
        singularLabel="Category"
      />

      {creationName !== null && (
        <CategoryCreationSheet
          error={
            createCategory.error instanceof Error
              ? createCategory.error.message
              : createCategory.isError
                ? 'Please try again.'
                : null
          }
          initialColor={suggestCategoryColor(categoriesQuery.data ?? [])}
          initialName={creationName}
          isCreating={createCategory.isPending}
          onCancel={() => {
            createCategory.reset();
            setCreationName(null);
          }}
          onCreate={(name, color) => {
            createCategory.mutate(
              { name, color },
              {
                onSuccess: (created) => {
                  props.onSearchChange(created.name);
                  setCreationName(null);
                },
              }
            );
          }}
        />
      )}

      {editingCategory !== null && (
        <CategoryCreationSheet
          mode="edit"
          error={
            updateCategory.error instanceof Error
              ? updateCategory.error.message
              : updateCategory.isError
                ? 'Please try again.'
                : null
          }
          initialColor={editingCategory.metadata.color}
          initialName={editingCategory.metadata.name}
          isCreating={updateCategory.isPending}
          onCancel={() => {
            updateCategory.reset();
            setEditingCategory(null);
          }}
          onCreate={(name, color) => {
            updateCategory.mutate(
              { id: editingCategory.metadata.id, input: { name, color } },
              {
                onSuccess: (updated) => {
                  if (props.search.trim()) {
                    props.onSearchChange(updated.name);
                  }
                  setEditingCategory(null);
                },
              }
            );
          }}
          onDelete={() =>
            requestDeletion(
              {
                kind: 'category',
                id: editingCategory.metadata.id,
                name: editingCategory.metadata.name,
                eventCount: editingCategory.eventCount,
              },
              () => setEditingCategory(null)
            )
          }
        />
      )}
    </>
  );
}

function TagsSection(props: SectionContentProps) {
  const { requestDeletion } = useMetadataDeletion();
  const input = useMemo(() => queryInput(props.search), [props.search]);
  const query = useTagsWithUsageQuery(input);
  const createTag = useCreateTagMutation();
  const updateTag = useUpdateTagMutation();
  const [editingTag, setEditingTag] = useState<MetadataUsageItem<Tag> | null>(
    null
  );

  return (
    <>
      <MetadataUsageList
        {...props}
        creationError={
          createTag.error instanceof Error
            ? createTag.error.message
            : createTag.isError
              ? 'Please try again.'
              : null
        }
        isCreating={createTag.isPending}
        kind="tag"
        label="Tags"
        onCreate={(name) =>
          createTag.mutate(
            { name },
            { onSuccess: (created) => props.onSearchChange(created.name) }
          )
        }
        onEdit={(item) => {
          updateTag.reset();
          setEditingTag(item);
        }}
        onSearchChange={(search) => {
          createTag.reset();
          props.onSearchChange(search);
        }}
        query={query}
        singularLabel="Tag"
      />

      {editingTag !== null && (
        <NamedMetadataEditSheet
          entityLabel="Tag"
          error={
            updateTag.error instanceof Error
              ? updateTag.error.message
              : updateTag.isError
                ? 'Please try again.'
                : null
          }
          initialName={editingTag.metadata.name}
          isSaving={updateTag.isPending}
          onCancel={() => {
            updateTag.reset();
            setEditingTag(null);
          }}
          onSave={(name) =>
            updateTag.mutate(
              { id: editingTag.metadata.id, input: { name } },
              {
                onSuccess: (updated) => {
                  if (props.search.trim()) {
                    props.onSearchChange(updated.name);
                  }
                  setEditingTag(null);
                },
              }
            )
          }
          onDelete={() =>
            requestDeletion(
              {
                kind: 'tag',
                id: editingTag.metadata.id,
                name: editingTag.metadata.name,
                eventCount: editingTag.eventCount,
              },
              () => setEditingTag(null)
            )
          }
        />
      )}
    </>
  );
}

function PeopleSection(props: SectionContentProps) {
  const { requestDeletion } = useMetadataDeletion();
  const input = useMemo(() => queryInput(props.search), [props.search]);
  const query = usePeopleWithUsageQuery(input);
  const createPerson = useCreatePersonMutation();
  const updatePerson = useUpdatePersonMutation();
  const [editingPerson, setEditingPerson] =
    useState<MetadataUsageItem<Person> | null>(null);

  return (
    <>
      <MetadataUsageList
        {...props}
        creationError={
          createPerson.error instanceof Error
            ? createPerson.error.message
            : createPerson.isError
              ? 'Please try again.'
              : null
        }
        isCreating={createPerson.isPending}
        kind="person"
        label="People"
        onCreate={(name) =>
          createPerson.mutate(
            { name },
            { onSuccess: (created) => props.onSearchChange(created.name) }
          )
        }
        onEdit={(item) => {
          updatePerson.reset();
          setEditingPerson(item);
        }}
        onSearchChange={(search) => {
          createPerson.reset();
          props.onSearchChange(search);
        }}
        query={query}
        singularLabel="Person"
      />

      {editingPerson !== null && (
        <NamedMetadataEditSheet
          entityLabel="Person"
          error={
            updatePerson.error instanceof Error
              ? updatePerson.error.message
              : updatePerson.isError
                ? 'Please try again.'
                : null
          }
          initialName={editingPerson.metadata.name}
          isSaving={updatePerson.isPending}
          onCancel={() => {
            updatePerson.reset();
            setEditingPerson(null);
          }}
          onSave={(name) =>
            updatePerson.mutate(
              { id: editingPerson.metadata.id, input: { name } },
              {
                onSuccess: (updated) => {
                  if (props.search.trim()) {
                    props.onSearchChange(updated.name);
                  }
                  setEditingPerson(null);
                },
              }
            )
          }
          onDelete={() =>
            requestDeletion(
              {
                kind: 'person',
                id: editingPerson.metadata.id,
                name: editingPerson.metadata.name,
                eventCount: editingPerson.eventCount,
              },
              () => setEditingPerson(null)
            )
          }
        />
      )}
    </>
  );
}

function LocationsSection(props: SectionContentProps) {
  const { requestDeletion } = useMetadataDeletion();
  const input = useMemo(() => queryInput(props.search), [props.search]);
  const query = useLocationsWithUsageQuery(input);
  const createLocation = useCreateLocationMutation();
  const updateLocation = useUpdateLocationMutation();
  const [editingLocation, setEditingLocation] =
    useState<MetadataUsageItem<Location> | null>(null);

  return (
    <>
      <MetadataUsageList
        {...props}
        creationError={
          createLocation.error instanceof Error
            ? createLocation.error.message
            : createLocation.isError
              ? 'Please try again.'
              : null
        }
        isCreating={createLocation.isPending}
        kind="location"
        label="Locations"
        onCreate={(name) =>
          createLocation.mutate(
            { name },
            { onSuccess: (created) => props.onSearchChange(created.name) }
          )
        }
        onEdit={(item) => {
          updateLocation.reset();
          setEditingLocation(item);
        }}
        onSearchChange={(search) => {
          createLocation.reset();
          props.onSearchChange(search);
        }}
        query={query}
        singularLabel="Location"
      />

      {editingLocation !== null && (
        <NamedMetadataEditSheet
          entityLabel="Location"
          error={
            updateLocation.error instanceof Error
              ? updateLocation.error.message
              : updateLocation.isError
                ? 'Please try again.'
                : null
          }
          initialName={editingLocation.metadata.name}
          isSaving={updateLocation.isPending}
          onCancel={() => {
            updateLocation.reset();
            setEditingLocation(null);
          }}
          onSave={(name) =>
            updateLocation.mutate(
              { id: editingLocation.metadata.id, input: { name } },
              {
                onSuccess: (updated) => {
                  if (props.search.trim()) {
                    props.onSearchChange(updated.name);
                  }
                  setEditingLocation(null);
                },
              }
            )
          }
          onDelete={() =>
            requestDeletion(
              {
                kind: 'location',
                id: editingLocation.metadata.id,
                name: editingLocation.metadata.name,
                eventCount: editingLocation.eventCount,
              },
              () => setEditingLocation(null)
            )
          }
        />
      )}
    </>
  );
}

export default function MetadataUsageSection({
  section,
  ...props
}: MetadataUsageSectionProps) {
  switch (section) {
    case 'categories':
      return <CategoriesSection {...props} />;
    case 'tags':
      return <TagsSection {...props} />;
    case 'people':
      return <PeopleSection {...props} />;
    case 'locations':
      return <LocationsSection {...props} />;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: spacing[3] },
  createRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginHorizontal: spacing[4],
    marginBottom: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.md,
  },
  createText: { ...typography.small, flex: 1, fontWeight: '600' },
  creationError: {
    ...typography.small,
    marginHorizontal: spacing[4],
    marginBottom: spacing[2],
  },
  toolbar: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    marginBottom: spacing[1],
  },
  resultCount: { ...typography.caption },
  sortButton: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[2],
    borderRadius: radius.sm,
  },
  sortText: { ...typography.caption },
  listContent: { paddingHorizontal: spacing[4], paddingBottom: spacing[6] },
  emptyListContent: { flexGrow: 1 },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
    paddingVertical: spacing[2],
  },
  pendingRow: { opacity: 0.58 },
  rowMain: {
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  colorMarker: { width: 10, height: 32, borderRadius: radius.sm },
  name: { ...typography.body, flex: 1 },
  usage: { ...typography.caption, flexShrink: 0 },
  deleteAction: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
    borderRadius: radius.sm,
  },
  deleteActionText: { ...typography.caption, fontWeight: '700' },
  separator: { height: StyleSheet.hairlineWidth },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[8],
  },
  stateTitle: { ...typography.h3, textAlign: 'center' },
  stateText: { ...typography.small, textAlign: 'center' },
  retryButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing[5],
    borderRadius: radius.md,
  },
  retryText: { ...typography.small, fontWeight: '700' },
});
