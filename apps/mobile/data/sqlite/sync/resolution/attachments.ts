import { and, eq } from 'drizzle-orm';
import type { SyncTransaction } from '../../database';
import {
  eventAttachments,
  events,
  syncOperations,
  syncFieldVersions,
  syncLocalState,
} from '../../schema';
import type { Operation, SyncFieldName } from '../types';
import { winningFieldsFor } from '../entityFields';
import { OperationValidationError } from '../validation/OperationValidationError';
import { hasSeen, compareOperations } from './operationOrder';

export type AttachmentOperation = Extract<
  Operation,
  { operationType: 'attachment.create' | 'attachment.delete' }
>;

function requireCreation(
  operation: AttachmentOperation,
  entityType: 'event' | 'attachment',
  entityId: string,
  tx: SyncTransaction
) {
  const creations = tx
    .select({
      originDeviceId: syncOperations.originDeviceId,
      originSequence: syncOperations.originSequence,
    })
    .from(syncOperations)
    .where(
      and(
        eq(syncOperations.entityType, entityType),
        eq(syncOperations.entityId, entityId),
        eq(
          syncOperations.operationType,
          entityType === 'event' ? 'entity.create' : 'attachment.create'
        )
      )
    )
    .limit(2)
    .all();
  if (
    creations.length > 1 ||
    (creations[0] && !hasSeen(operation, creations[0]))
  )
    throw new OperationValidationError(
      'Attachment operation must causally include creation.'
    );
  if (
    !creations.length &&
    operation.originDeviceId !==
      tx.select().from(syncLocalState).get()?.deviceId
  )
    throw new OperationValidationError(
      'Incoming attachment requires creation history; bootstrap is required.'
    );
}

export function resolveAttachment(
  operation: AttachmentOperation,
  tx: SyncTransaction
): readonly SyncFieldName[] {
  const existing = tx
    .select()
    .from(eventAttachments)
    .where(eq(eventAttachments.id, operation.entityId))
    .get();
  if (operation.operationType === 'attachment.create') {
    const recorded = tx
      .select({ originSequence: syncOperations.originSequence })
      .from(syncOperations)
      .where(
        and(
          eq(syncOperations.entityType, 'attachment'),
          eq(syncOperations.entityId, operation.entityId),
          eq(syncOperations.operationType, 'attachment.create')
        )
      )
      .get();
    if (existing || recorded)
      throw new OperationValidationError(
        'Attachment identity already exists; a second creation is invalid.'
      );
    // A tombstoned parent is allowed: it hides the attachment, not its history.
    if (
      !tx
        .select({ id: events.id })
        .from(events)
        .where(eq(events.id, operation.payload.eventId))
        .get()
    )
      throw new OperationValidationError(
        'Attachment parent event was not found.'
      );
    requireCreation(operation, 'event', operation.payload.eventId, tx);
    return winningFieldsFor(operation);
  }
  if (!existing)
    throw new OperationValidationError('Attachment to delete was not found.');
  requireCreation(operation, 'attachment', operation.entityId, tx);
  const version = tx
    .select()
    .from(syncFieldVersions)
    .where(
      and(
        eq(syncFieldVersions.entityType, 'attachment'),
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
      'Attachment version points to missing history.'
    );
  if (previous.operationType !== 'attachment.delete') return ['deleted_at'];
  return hasSeen(operation, previous) ||
    (!hasSeen(previous, operation) &&
      compareOperations(operation, previous) > 0)
    ? ['deleted_at']
    : [];
}
