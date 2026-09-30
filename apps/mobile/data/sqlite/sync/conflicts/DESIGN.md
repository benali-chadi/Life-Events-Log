# Manual field conflict resolution

Status: data layer and event-details UI implemented. Native UI verification on
Android remains; metadata UI and timeline indicators are not included.

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
