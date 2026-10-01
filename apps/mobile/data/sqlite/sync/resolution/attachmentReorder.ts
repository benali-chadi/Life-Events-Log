import { and, eq } from 'drizzle-orm';
import type { SyncTransaction } from '../../database';
import {
  events,
  eventAttachments,
  syncFieldVersions,
  syncOperations,
} from '../../schema';
import type { Operation, SyncFieldName } from '../types';
import { requireCreation } from './attachments';
import { hasSeen, compareOperations } from './operationOrder';
import { OperationValidationError } from '../validation/OperationValidationError';

export type AttachmentReorderOperation = Extract<
  Operation,
  { operationType: 'event.attachment.reorder' }
>;

export function resolveAttachmentReorder(
  operation: AttachmentReorderOperation,
  tx: SyncTransaction
): readonly SyncFieldName[] {
  if (
    !tx
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, operation.entityId))
      .get()
  )
    throw new OperationValidationError('Reorder event was not found.');
  requireCreation(operation, 'event', operation.entityId, tx);
  for (const id of operation.payload.orderedAttachmentIds) {
    const attachment = tx
      .select()
      .from(eventAttachments)
      .where(eq(eventAttachments.id, id))
      .get();
    if (!attachment)
      throw new OperationValidationError('Reordered attachment was not found.');
    if (attachment.eventId !== operation.entityId)
      throw new OperationValidationError(
        'Reordered attachment belongs to another event.'
      );
    // Tombstones are valid references, but creation must still precede reorder.
    requireCreation(operation, 'attachment', id, tx);
  }
  const version = tx
    .select()
    .from(syncFieldVersions)
    .where(
      and(
        eq(syncFieldVersions.entityType, 'event'),
        eq(syncFieldVersions.entityId, operation.entityId),
        eq(syncFieldVersions.fieldName, 'attachment_order')
      )
    )
    .get();
  if (!version) return ['attachment_order'];
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
  if (!previous || previous.operationType !== 'event.attachment.reorder')
    throw new OperationValidationError(
      'Attachment order version points to invalid history.'
    );
  return hasSeen(operation, previous) ||
    (!hasSeen(previous, operation) &&
      compareOperations(operation, previous) > 0)
    ? ['attachment_order']
    : [];
}
