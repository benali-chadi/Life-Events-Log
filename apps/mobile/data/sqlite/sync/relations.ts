import { and, eq } from 'drizzle-orm';
import type { SyncTransaction } from '../database';
import {
  events,
  tags,
  people,
  eventTags,
  eventPeople,
  syncOperations,
  syncFieldVersions,
  syncLocalState,
} from '../schema';
import type { Operation, SyncFieldName } from './types';
import { hasSeen, compareOperations } from './utils/operationOrder';
import { OperationValidationError } from './OperationValidationError';

export type RelationOperation = Extract<
  Operation,
  { operationType: 'relation.add' | 'relation.remove' }
>;

export function relationTarget(operation: RelationOperation) {
  const table = operation.entityType === 'event_tag' ? eventTags : eventPeople;
  const metadataId =
    'tagId' in operation.payload
      ? operation.payload.tagId
      : operation.payload.personId;
  const column =
    operation.entityType === 'event_tag'
      ? eventTags.tagId
      : eventPeople.personId;
  return {
    table,
    metadataId,
    where: and(
      eq(table.eventId, operation.payload.eventId),
      eq(column, metadataId)
    ),
  };
}

export function resolveRelation(
  operation: RelationOperation,
  tx: SyncTransaction
): readonly SyncFieldName[] {
  const { table, where, metadataId } = relationTarget(operation);
  const local =
    operation.originDeviceId ===
    tx.select().from(syncLocalState).get()?.deviceId;
  for (const [entityType, entityId, endpointTable] of [
    ['event', operation.payload.eventId, events],
    [
      operation.entityType === 'event_tag' ? 'tag' : 'person',
      metadataId,
      operation.entityType === 'event_tag' ? tags : people,
    ],
  ] as const) {
    if (
      !tx
        .select({ id: endpointTable.id })
        .from(endpointTable)
        .where(eq(endpointTable.id, entityId))
        .get()
    )
      throw new OperationValidationError('Relation endpoint was not found.');
    const creations = tx
      .select()
      .from(syncOperations)
      .where(
        and(
          eq(syncOperations.entityType, entityType),
          eq(syncOperations.entityId, entityId),
          eq(syncOperations.operationType, 'entity.create')
        )
      )
      .all();
    if (
      creations.length > 1 ||
      (creations[0] && !hasSeen(operation, creations[0]))
    )
      throw new OperationValidationError(
        'Relation must causally include endpoint creation.'
      );
    if (!creations.length && !local)
      throw new OperationValidationError(
        'Incoming relation requires endpoint creation history; bootstrap is required.'
      );
  }
  if (operation.operationType === 'relation.remove') {
    if (!tx.select().from(table).where(where).get())
      throw new OperationValidationError('Relation to remove was not found.');
    const additions = tx
      .select()
      .from(syncOperations)
      .where(
        and(
          eq(syncOperations.entityType, operation.entityType),
          eq(syncOperations.entityId, operation.entityId),
          eq(syncOperations.operationType, 'relation.add')
        )
      )
      .all();
    if (
      (additions.length && !additions.some((add) => hasSeen(operation, add))) ||
      (!additions.length && !local)
    )
      throw new OperationValidationError(
        'Relation removal requires a causally preceding addition.'
      );
  }
  const version = tx
    .select()
    .from(syncFieldVersions)
    .where(
      and(
        eq(syncFieldVersions.entityType, operation.entityType),
        eq(syncFieldVersions.entityId, operation.entityId),
        eq(syncFieldVersions.fieldName, 'deleted_at')
      )
    )
    .get();
  if (!version) return ['deleted_at'];
  const previous = tx
    .select()
    .from(syncOperations)
    .where(
      and(
        eq(syncOperations.originDeviceId, version.winnerDeviceId),
        eq(syncOperations.originSequence, version.winnerSequence)
      )
    )
    .get();
  if (!previous)
    throw new OperationValidationError(
      'Relation version points to missing history.'
    );
  return hasSeen(operation, previous) ||
    (!hasSeen(previous, operation) &&
      compareOperations(operation, previous) > 0)
    ? ['deleted_at']
    : [];
}
