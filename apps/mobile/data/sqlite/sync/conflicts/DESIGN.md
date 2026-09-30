# Manual field conflict resolution

Status: data layer, event-details UI, and metadata UI implemented. Event review
and metadata review verified by the user on Android. Timeline indicators
implemented; their Android layout/touch verification remains pending.

## Goal and example

Let a user choose the current or alternative value of a pending field conflict.
Keeping the displayed title still emits a pending title patch: it acknowledges
the conflict rather than silently treating an unchanged value as a no-op.

## Flow

1. Query pending conflicts for one entity, including both values from the
   referenced immutable operations. Return values ready for the comparison sheet.
2. Resolve by conflict ID and choice, deriving entity identity/field from the row.
3. In one transaction, return already-resolved if no pending row remains;
   otherwise require an active entity and load the chosen value.
4. Apply an entity.patch for that field via applyPendingOperation, with the local
   clock timestamp. Existing compaction and conflict clearing do the remaining work.
5. Invalidate conflict and affected entity queries after success. The eventual UI
   closes the sheet; errors leave the conflict untouched and can be shown there.

No sealing, special replicated resolution operation, or direct conflict deletion.
Failure rolls back the patch and conflict clearing together. Import and review
do not overlap in the current UI: no stale-pair token or concurrency UI is added.

## Responsibilities

- SQLite conflict service: queries, operation-value lookup, active-target checks,
  transaction, and pending patch. Reuse local metadata uniqueness policy when
  choosing a different normalized name; accepting an existing name remains valid.
- applyPendingOperation: payload validation, mutation, compaction, conflict clearing.
- TanStack hooks: query keys, resolution mutation, and cache invalidation.
- Future event-details UI: indicators outside edit mode, choice sheet, close/toast.

## Choices

Use the existing SQLite context/factory pattern used by sync transfer hooks;
do not introduce another provider or extend the in-memory repository backend.
Query one entity at a time, not the whole conflict table or every timeline event.
Event fields are title/date/time/significance/notes; category name/color and other
metadata names use the same backend. Metadata UI and timeline discovery are deferred.

## Interface

```ts
createConflictService(database, { now }): {
  getConflicts(entityType, entityId): FieldConflict[];
  resolveConflict(conflictId, choice): ResolveConflictResult;
}
useEntityConflictsQuery(entityType, entityId);
useResolveConflictMutation(); // mutate({ conflictId, choice })
```

Choice is current or alternative. Result distinguishes resolved (with entity
identity) from already-resolved. The service hides operation payloads from UI code.

## First implementation slice

Implement the service and hooks with tests for both choices, unchanged-value
acknowledgment, only clearing the chosen field, compaction, repeat resolution,
inactive targets, invalid history, rollback, and query invalidation. Ordinary
edit/delete hooks invalidate conflicts; sync import already invalidates all queries.
UI presentation, custom-value editing inside the sheet, and list indicators remain
separate work. No stale-conflict handling is implied by this interface.

## Event-details UI slice

Show a GitCompareArrows button beside each conflicted title, date, time,
significance, or notes field before editing. Date/time have separate indicators;
empty notes and unset time still expose theirs. No timeline or metadata UI yet.

Use the existing bottom-sheet primitive. Show Current value and Alternative value
with explicit Keep current / Use alternative actions, full scrollable text, and
clear empty-value labels. Notes are plain text so markdown source is not hidden.
Close/backdrop/Android Back dismiss without writes; disable actions and dismissal
while resolving. Failed saves stay in the sheet with an error and retryable actions.
Successful or already-resolved results close it; the latter shows a toast.

One event conflict query feeds the indicators. The sheet owns its resolution
mutation and reuses its invalidation. The event screen synchronizes only the
resolved field's local display/draft state; unrelated drafts must not be reset.
Hide the title/notes indicator while that field is being edited, and disable
review entry while an ordinary event save is pending. Import and review remain
non-overlapping; no stale-pair machinery is introduced.

Components: ConflictIndicator (accessible 44px target), ConflictResolutionSheet
(comparison/actions), and small optional action slots in existing field views.
Verify empty values, formatting, both choices, dismissal/errors/pending state,
and visible updates without overwriting unrelated edits. Native layout, scrolling,
accessibility, and Android Back need an Android check; no new UI framework.

## Manage metadata UI slice

One pending-conflicts query for the active metadata type, grouped by entity ID
and field, feeds Manage metadata. Name indicators sit beside row names; category
color indicators sit beside swatches. They open review directly, not editing.
Keep review controls separate from row edit pressables and hide them in selection
mode or for pending-deletion rows. Close any open swipe before opening review.

Reuse ConflictResolutionSheet and the existing mutation/invalidation. Show color
values as theme-aware swatches with readable labels; names remain raw values, not
derived disambiguation suffixes. Display the metadata name as sheet context.
Duplicate-name errors remain in the sheet for retry or dismissal; normal rename
is still available outside it and clears the corresponding conflict.

Add a type-level conflict query/key without per-row queries. Preserve current
search, usage sorting, editing, deletion, and multi-selection. Pull-to-refresh
refreshes both metadata and conflicts; conflict-load failure offers retry.
Verify type filtering, independent name/color actions, swatches, selection and
deletion guards, and existing failure handling. Android layout/touch verification
for this slice remains separate; no timeline or centralized conflict screen.

## Timeline indicator slice

### Goal and example

Flag events with pending field conflicts without offering resolution in the
timeline. An event with title and notes conflicts gets one comparison icon;
opening its details exposes the existing field-level review controls.

### Flow

Query distinct event IDs with pending conflicts once for the timeline, build an
ID set, and pass a boolean to each card. Show a non-interactive comparison icon
in the header beside its existing time/significance information. Keep normal
card navigation and selection behavior. Include conflict status in accessibility
text. Refresh with existing conflict invalidations and timeline pull-to-refresh.
Query failure must not block the timeline; offer retry rather than imply that
an unsuccessful query found no conflicts. There are no writes or cancellation
steps in this slice.

### Responsibilities and choices

The service selects distinct pending event IDs, without loading operation values.
TanStack Query owns caching/refetching; the timeline maps IDs to cards, and cards
only render the boolean. A single query avoids per-card queries. Querying all
pending event IDs keeps pagination simple; memory scales with conflicted events,
not operation history. Metadata conflicts do not flag associated events.

### Interface

Service method: `getConflictedEventIds(): string[]`.
Hook: `useConflictedEventIdsQuery()` under the conflicts query-key prefix.
Card/header prop: `hasConflicts?: boolean`. No press handler on the icon.

### First implementation slice

Implement the lightweight query and header indicator only. Test deduplication,
pending/event filtering, card presence/absence, accessibility, and refresh wiring;
check layout on Android. Agreed placement is the header's trailing information
area, and the informational icon remains visible during selection.
No conflict count, sheet, or new
resolution action is added to the timeline.
