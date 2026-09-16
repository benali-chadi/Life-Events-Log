import { and, eq } from 'drizzle-orm';
import type { SyncTransaction } from '../database';
import {
  categories,
  events,
  locations,
  people,
  tags,
  syncOperations,
  syncFieldVersions,
  syncConflicts,
  syncLocalState,
} from '../schema';
import type {
  Operation,
  OperationId,
  DomainFieldName,
  SyncFieldName,
} from './types';
import { entityFields, winningFieldsFor } from './entityFields';
import { OperationValidationError } from './OperationValidationError';
import { conflictId } from './utils/conflictId';
import { resolveRelation } from './relations';

import { hasSeen, compareOperations } from './utils/operationOrder';

type EntityOperation = Extract<
  Operation,
  { operationType: 'entity.create' | 'entity.patch' | 'entity.delete' }
>;
const tables = {
  event: events,
  category: categories,
  tag: tags,
  person: people,
  location: locations,
};
const reviewFields: Record<EntityOperation['entityType'], readonly string[]> = {
  event: ['title', 'date', 'time', 'significance', 'notes'],
  category: ['name', 'color'],
  tag: ['name'],
  person: ['name'],
  location: ['name'],
};
export { hasSeen, compareOperations } from './utils/operationOrder';

function storedOperation(id: OperationId, tx: SyncTransaction): Operation {
  const row = tx
    .select()
    .from(syncOperations)
    .where(
      and(
        eq(syncOperations.originDeviceId, id.originDeviceId),
        eq(syncOperations.originSequence, id.originSequence)
      )
    )
    .get();
  if (!row)
    throw new OperationValidationError(
      'Field version points to missing operation history.'
    );
  // Persisted operations have already passed envelope and payload validation.
  return row as Operation;
}

function valueAt(operation: Operation, field: SyncFieldName): unknown {
  if (operation.operationType === 'entity.delete')
    return operation.payload.deletedAt;
  if (
    operation.operationType !== 'entity.create' &&
    operation.operationType !== 'entity.patch'
  )
    throw new OperationValidationError(
      'Unexpected operation behind entity field version.'
    );
  if (field === 'deleted_at') return null;
  const key = Object.entries(entityFields[operation.entityType]).find(
    ([, name]) => name === field
  )?.[0];
  const values =
    operation.operationType === 'entity.patch'
      ? operation.payload.changes
      : operation.payload;
  if (!key || !Object.hasOwn(values, key))
    throw new OperationValidationError(
      'Field version points to an operation without that field.'
    );
  return (values as Record<string, unknown>)[key];
}

/** Resolves supported entity operations and local best-effort conflict UI state.
 * Name collisions across different identities remain a constraint error.
 */
export function resolveOperation(
  operation: Operation,
  tx: SyncTransaction
): readonly SyncFieldName[] {
  const fields = winningFieldsFor(operation); // Reject unsupported mutation families.
  if (
    operation.operationType === 'relation.add' ||
    operation.operationType === 'relation.remove'
  )
    return resolveRelation(operation, tx);
  if (
    operation.operationType !== 'entity.create' &&
    operation.operationType !== 'entity.patch' &&
    operation.operationType !== 'entity.delete'
  )
    throw new Error('Resolution not implemented for this operation.');
  const table = tables[operation.entityType];
  const existing = tx
    .select()
    .from(table)
    .where(eq(table.id, operation.entityId))
    .get();
  const creations = tx
    .select()
    .from(syncOperations)
    .where(
      and(
        eq(syncOperations.entityType, operation.entityType),
        eq(syncOperations.entityId, operation.entityId),
        eq(syncOperations.operationType, 'entity.create')
      )
    )
    .all();
  if (operation.operationType === 'entity.create') {
    if (existing || creations.length)
      throw new OperationValidationError(
        'Entity identity already exists; a second creation is invalid.'
      );
    return fields;
  }
  if (!existing)
    throw new OperationValidationError('Operation target was not found.');
  if (creations.length > 1)
    throw new OperationValidationError(
      'Entity has multiple creation operations.'
    );
  if (creations[0] && !hasSeen(operation, creations[0]))
    throw new OperationValidationError(
      'Operation must causally include its entity creation.'
    );
  // Transitional local editing of legacy rows remains possible until user-data
  // bootstrap exists. Such history is not accepted from another replica.
  if (
    !creations.length &&
    operation.originDeviceId !==
      tx.select().from(syncLocalState).get()?.deviceId
  )
    throw new OperationValidationError(
      'Incoming entity requires creation history; bootstrap is required.'
    );

  const entityConflicts = and(
    eq(syncConflicts.entityType, operation.entityType),
    eq(syncConflicts.entityId, operation.entityId)
  );
  if (operation.operationType === 'entity.delete')
    tx.delete(syncConflicts).where(entityConflicts).run();
  if (operation.operationType === 'entity.patch' && existing.deletedAt !== null)
    return [];
  const winners: SyncFieldName[] = [];
  for (const field of fields) {
    const version = tx
      .select()
      .from(syncFieldVersions)
      .where(
        and(
          eq(syncFieldVersions.entityType, operation.entityType),
          eq(syncFieldVersions.entityId, operation.entityId),
          eq(syncFieldVersions.fieldName, field)
        )
      )
      .get();
    const previous = version
      ? storedOperation(
          {
            originDeviceId: version.winnerDeviceId,
            originSequence: version.winnerSequence,
          },
          tx
        )
      : undefined;
    const concurrent =
      previous !== undefined &&
      !hasSeen(operation, previous) &&
      !hasSeen(previous, operation);
    const wins =
      !previous ||
      (operation.operationType === 'entity.delete' &&
        previous.operationType !== 'entity.delete') ||
      hasSeen(operation, previous) ||
      (concurrent && compareOperations(operation, previous) > 0);
    if (wins) winners.push(field);
    if (!reviewFields[operation.entityType].includes(field)) continue;
    const existingConflictWhere = and(
      entityConflicts,
      eq(syncConflicts.fieldName, field as DomainFieldName)
    );
    const oldConflict = tx
      .select()
      .from(syncConflicts)
      .where(existingConflictWhere)
      .get();
    if (wins && oldConflict?.status === 'pending') {
      const alternative = storedOperation(
        {
          originDeviceId: oldConflict.losingDeviceId,
          originSequence: oldConflict.losingSequence,
        },
        tx
      );
      // Replacing the displayed winner does not acknowledge its alternative.
      // Preserve that alternative until it is seen or its value is adopted.
      if (
        !hasSeen(operation, alternative) &&
        valueAt(operation, field) !== valueAt(alternative, field)
      ) {
        tx.update(syncConflicts)
          .set({
            winningDeviceId: operation.originDeviceId,
            winningSequence: operation.originSequence,
          })
          .where(existingConflictWhere)
          .run();
        continue;
      }
    }
    if (wins) tx.delete(syncConflicts).where(existingConflictWhere).run();
    if (
      !concurrent ||
      !previous ||
      valueAt(operation, field) === valueAt(previous, field)
    )
      continue;
    const winner = wins ? operation : previous;
    let loser = wins ? previous : operation;
    // One alternative per field, preferring a later causal revision or the
    // greater deterministic rank. Conflict lists need not converge across devices.
    if (!wins && oldConflict) {
      const oldLoser = storedOperation(
        {
          originDeviceId: oldConflict.losingDeviceId,
          originSequence: oldConflict.losingSequence,
        },
        tx
      );
      if (
        hasSeen(oldLoser, loser) ||
        (!hasSeen(loser, oldLoser) && compareOperations(oldLoser, loser) > 0)
      )
        loser = oldLoser;
    }
    tx.delete(syncConflicts).where(existingConflictWhere).run();
    tx.insert(syncConflicts)
      .values({
        // Stable local key enforces our single pending alternative per field.
        conflictId: conflictId(
          operation.entityType,
          operation.entityId,
          field as DomainFieldName
        ),
        entityType: operation.entityType,
        entityId: operation.entityId,
        fieldName: field as DomainFieldName,
        winningDeviceId: winner.originDeviceId,
        winningSequence: winner.originSequence,
        losingDeviceId: loser.originDeviceId,
        losingSequence: loser.originSequence,
        status: 'pending',
        resolutionDeviceId: null,
        resolutionSequence: null,
      })
      .run();
  }
  return winners;
}
