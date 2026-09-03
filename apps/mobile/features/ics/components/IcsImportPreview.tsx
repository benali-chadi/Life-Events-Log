import { eventColors, radius, spacing, typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  MapPin,
  Users,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import CategoryCreationSheet from '@/components/metadata/CategoryCreationSheet';
import { suggestCategoryColor } from '@/components/metadata/suggestCategoryColor';
import SingleSelect from '@/components/ui/SingleSelect';
import type { SelectOption } from '@/components/ui/select';
import { useCategoriesQuery, useCommitEventImportMutation } from '@/data/query';
import type {
  CommitEventImportResult,
  EventImportCategory,
} from '@/data/repositories';
import type { CategoryColor } from '@/models';
import {
  buildIcsImportCommitInput,
  selectedWarningCount,
} from './buildIcsImportCommitInput';
import type {
  IcsImportCandidate,
  IcsImportMappingResult,
  IcsImportMetadataReference,
} from '../mapping/types';

type IcsImportPreviewProps = {
  mapping: IcsImportMappingResult;
  onCancel: () => void;
  onImported: (result: CommitEventImportResult) => void;
};

type ProposedCategory = { name: string; color: CategoryColor };
const PROPOSED_CATEGORY_ID = 'ics-import-proposed-category';

export default function IcsImportPreview({
  mapping,
  onCancel,
  onImported,
}: IcsImportPreviewProps) {
  const { colors, isDark } = useTheme();
  const categoriesQuery = useCategoriesQuery();
  const commitImport = useCommitEventImportMutation();
  const [selectedIds, setSelectedIds] = useState(
    () => new Set(mapping.candidates.map((candidate) => candidate.id))
  );
  const [categoryOption, setCategoryOption] = useState<SelectOption | null>(
    null
  );
  const [proposedCategory, setProposedCategory] =
    useState<ProposedCategory | null>(null);
  const [categoryCreationName, setCategoryCreationName] = useState<
    string | null
  >(null);
  const [showWarningEventsOnly, setShowWarningEventsOnly] = useState(false);

  const categories = useMemo(
    () => categoriesQuery.data ?? [],
    [categoriesQuery.data]
  );
  const categoryOptions = useMemo(() => {
    const options = categories.map((category) => ({
      id: category.id,
      label: category.name,
      color: eventColors[category.color][isDark ? 'dark' : 'light'],
    }));
    if (proposedCategory) {
      options.unshift({
        id: PROPOSED_CATEGORY_ID,
        label: proposedCategory.name,
        color: eventColors[proposedCategory.color][isDark ? 'dark' : 'light'],
      });
    }
    return options;
  }, [categories, isDark, proposedCategory]);

  const selectedCount = selectedIds.size;
  const warningCount = selectedWarningCount(mapping.candidates, selectedIds);
  const warningEvents = useMemo(
    () =>
      mapping.candidates.filter((candidate) => candidate.warnings.length > 0),
    [mapping.candidates]
  );
  const visibleCandidates = showWarningEventsOnly
    ? warningEvents
    : mapping.candidates;
  const allSelected = selectedCount === mapping.candidates.length;
  const category = selectedCategory(categoryOption, proposedCategory);

  const toggleCandidate = (candidateId: string) => {
    if (commitImport.isPending) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  };

  const commit = async () => {
    if (selectedIds.size === 0 || commitImport.isPending) return;
    try {
      const result = await commitImport.mutateAsync(
        buildIcsImportCommitInput(mapping, selectedIds, category)
      );
      onImported(result);
    } catch (error) {
      // Keep the preview and its selection intact so the user can retry.
      const message =
        error instanceof Error ? error.message : 'Please try again.';
      // Alert is deliberately local to this workflow: repository errors are actionable here.
      Alert.alert('Couldn’t import events', message);
    }
  };

  const header = (
    <View style={styles.headerContent}>
      <View style={styles.summaryRow}>
        <View>
          <Text style={[styles.heading, { color: colors.text }]}>
            Review import
          </Text>
          <Text style={[styles.summary, { color: colors.textSecondary }]}>
            {selectedCount} of {mapping.candidates.length} events selected
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={mapping.candidates.length === 0 || commitImport.isPending}
          onPress={() =>
            setSelectedIds(
              allSelected
                ? new Set()
                : new Set(mapping.candidates.map((candidate) => candidate.id))
            )
          }
          style={({ pressed }) => [
            styles.selectionAction,
            pressed && { backgroundColor: colors.interactiveMuted },
          ]}
        >
          <Text style={[styles.selectionActionText, { color: colors.primary }]}>
            {allSelected ? 'Select none' : 'Select all'}
          </Text>
        </Pressable>
      </View>

      {(mapping.skipped.length > 0 || warningEvents.length > 0) && (
        <View
          style={[
            styles.notice,
            {
              backgroundColor: colors.warningMuted,
              borderColor: colors.warning,
            },
          ]}
        >
          <AlertTriangle color={colors.warning} size={18} />
          <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
            {mapping.skipped.length > 0
              ? `${mapping.skipped.length} event${mapping.skipped.length === 1 ? ' was' : 's were'} skipped. `
              : ''}
            {warningCount > 0
              ? `${warningCount} warning${warningCount === 1 ? '' : 's'} in selected events.`
              : warningEvents.length > 0
                ? `${warningEvents.length} event${warningEvents.length === 1 ? ' has' : 's have'} warnings.`
                : ''}
          </Text>
          {warningEvents.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: showWarningEventsOnly }}
              onPress={() => setShowWarningEventsOnly((current) => !current)}
              style={({ pressed }) => [
                styles.warningFilterButton,
                pressed && { backgroundColor: colors.interactivePressed },
              ]}
            >
              <Text
                style={[styles.warningFilterText, { color: colors.warning }]}
              >
                {showWarningEventsOnly ? 'Show all' : 'Show events'}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={[styles.categorySection, { borderColor: colors.border }]}>
        <Text style={[styles.sectionLabel, { color: colors.text }]}>
          Category
        </Text>
        <Text style={[styles.sectionHelp, { color: colors.textMuted }]}>
          Optional. Applied to every selected event and created only when you
          confirm.
        </Text>
        <SingleSelect
          clearable
          disabled={categoriesQuery.isPending || commitImport.isPending}
          onChange={(option) => {
            setCategoryOption(option);
            if (option?.id !== PROPOSED_CATEGORY_ID) setProposedCategory(null);
          }}
          onCreateRequest={setCategoryCreationName}
          options={categoryOptions}
          placeholder="No category"
          searchPlaceholder="Search or create a category..."
          value={categoryOption}
        />
      </View>

      <Text style={[styles.sectionLabel, { color: colors.text }]}>
        {showWarningEventsOnly ? 'Events with warnings' : 'Events'}
      </Text>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={visibleCandidates}
        extraData={selectedIds}
        keyExtractor={(candidate) => candidate.id}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            No importable events were found.
          </Text>
        }
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <CandidateRow
            candidate={item}
            selected={selectedIds.has(item.id)}
            onToggle={() => toggleCandidate(item.id)}
          />
        )}
      />

      <View
        style={[
          styles.footer,
          { backgroundColor: colors.surface, borderTopColor: colors.border },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          disabled={commitImport.isPending}
          onPress={onCancel}
          style={styles.footerButton}
        >
          <Text
            style={[styles.footerButtonText, { color: colors.textSecondary }]}
          >
            Cancel
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: selectedCount === 0 }}
          disabled={selectedCount === 0 || commitImport.isPending}
          onPress={() => void commit()}
          style={[
            styles.footerButton,
            styles.importButton,
            { backgroundColor: colors.primary },
            selectedCount === 0 && styles.disabled,
          ]}
        >
          {commitImport.isPending ? (
            <ActivityIndicator color={colors.onPrimary} size="small" />
          ) : (
            <Text
              style={[styles.footerButtonText, { color: colors.onPrimary }]}
            >
              Import {selectedCount || ''}
            </Text>
          )}
        </Pressable>
      </View>

      {categoryCreationName !== null && (
        <CategoryCreationSheet
          error={null}
          initialColor={suggestCategoryColor(categories)}
          initialName={categoryCreationName}
          isCreating={false}
          onCancel={() => setCategoryCreationName(null)}
          onCreate={(name, color) => {
            setProposedCategory({ name, color });
            setCategoryOption({
              id: PROPOSED_CATEGORY_ID,
              label: name,
              color: eventColors[color][isDark ? 'dark' : 'light'],
            });
            setCategoryCreationName(null);
          }}
        />
      )}
    </View>
  );
}

function CandidateRow({
  candidate,
  selected,
  onToggle,
}: {
  candidate: IcsImportCandidate;
  selected: boolean;
  onToggle: () => void;
}) {
  const { colors } = useTheme();
  const metadata = candidateMetadata(candidate);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.eventRow,
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && { backgroundColor: colors.interactiveMuted },
        !selected && styles.unselected,
      ]}
    >
      <View
        style={[
          styles.checkbox,
          {
            backgroundColor: selected ? colors.primary : 'transparent',
            borderColor: selected ? colors.primary : colors.borderStrong,
          },
        ]}
      >
        {selected && (
          <Check color={colors.onPrimary} size={14} strokeWidth={3} />
        )}
      </View>
      <View style={styles.eventContent}>
        <Text
          numberOfLines={2}
          style={[styles.eventTitle, { color: colors.text }]}
        >
          {candidate.event.title}
        </Text>
        <View style={styles.eventDetail}>
          <CalendarDays color={colors.textMuted} size={14} />
          <Text style={[styles.eventMetadata, { color: colors.textSecondary }]}>
            {candidate.event.date}
            {candidate.event.time ? ` · ${candidate.event.time}` : ' · All day'}
          </Text>
        </View>
        {metadata.people && (
          <View style={styles.eventDetail}>
            <Users color={colors.textMuted} size={14} />
            <Text
              numberOfLines={1}
              style={[styles.eventMetadata, { color: colors.textSecondary }]}
            >
              {metadata.people}
            </Text>
          </View>
        )}
        {metadata.location && (
          <View style={styles.eventDetail}>
            <MapPin color={colors.textMuted} size={14} />
            <Text
              numberOfLines={1}
              style={[styles.eventMetadata, { color: colors.textSecondary }]}
            >
              {metadata.location}
            </Text>
          </View>
        )}
        {candidate.warnings.map((warning, index) => (
          <Text
            key={`${warning.code}:${index}`}
            style={[styles.warningText, { color: colors.warning }]}
          >
            {warning.message}
          </Text>
        ))}
      </View>
    </Pressable>
  );
}

function selectedCategory(
  option: SelectOption | null,
  proposed: ProposedCategory | null
): EventImportCategory | null {
  if (!option) return null;
  if (option.id === PROPOSED_CATEGORY_ID && proposed) {
    return { kind: 'new', ...proposed };
  }
  return { kind: 'existing', id: option.id };
}

function candidateMetadata(candidate: IcsImportCandidate) {
  return {
    people: candidate.people.map(referenceName).join(', '),
    location: candidate.location ? referenceName(candidate.location) : null,
  };
}

function referenceName<TEntity extends { name: string }>(
  reference: IcsImportMetadataReference<TEntity>
) {
  return reference.kind === 'existing'
    ? reference.entity.name
    : reference.metadata.name;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { padding: spacing[4], paddingBottom: spacing[6] },
  headerContent: { gap: spacing[4], marginBottom: spacing[3] },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: { ...typography.h2 },
  summary: { ...typography.small, marginTop: spacing[1] },
  selectionAction: { padding: spacing[2], borderRadius: radius.sm },
  selectionActionText: { ...typography.small, fontWeight: '700' },
  notice: {
    flexDirection: 'row',
    gap: spacing[2],
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing[3],
  },
  noticeText: { ...typography.small, flex: 1 },
  warningFilterButton: {
    minHeight: 32,
    alignSelf: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    paddingHorizontal: spacing[2],
  },
  warningFilterText: { ...typography.caption, fontWeight: '700' },
  categorySection: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing[3],
  },
  sectionLabel: { ...typography.body, fontWeight: '700' },
  sectionHelp: {
    ...typography.small,
    marginTop: spacing[1],
    marginBottom: spacing[2],
  },
  empty: {
    ...typography.body,
    textAlign: 'center',
    paddingVertical: spacing[8],
  },
  eventRow: {
    flexDirection: 'row',
    gap: spacing[3],
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing[3],
    marginBottom: spacing[2],
  },
  unselected: { opacity: 0.58 },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  eventContent: { flex: 1, gap: spacing[1] },
  eventTitle: { ...typography.body, fontWeight: '600' },
  eventDetail: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  eventMetadata: { ...typography.small, flexShrink: 1 },
  warningText: { ...typography.caption, marginTop: spacing[1] },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing[2],
    borderTopWidth: 1,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  footerButton: {
    minWidth: 96,
    minHeight: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
  },
  footerButtonText: { ...typography.body, fontWeight: '700' },
  importButton: {},
  disabled: { opacity: 0.45 },
});
