import { and, eq, isNull, max } from 'drizzle-orm';
import type { SyncTransaction } from '../../database';
import { eventAttachments } from '../../schema';
import type { AttachmentOperation } from '../resolution/attachments';
import type { SyncFieldName } from '../types';
import { OperationValidationError } from '../validation/OperationValidationError';

/** Row-only mutations: no blob IO, parent-event writes, or reorder side effects. */
export function mutateAttachment(
  operation: AttachmentOperation,
  winningFields: readonly SyncFieldName[],
  tx: SyncTransaction
): void {
  if (!winningFields.length) return;
  if (operation.operationType === 'attachment.create') {
    // Appending is deliberately local: do not trust the origin's old position.
    const highest = tx
      .select({ value: max(eventAttachments.sortOrder) })
      .from(eventAttachments)
      .where(
        and(
          eq(eventAttachments.eventId, operation.payload.eventId),
          isNull(eventAttachments.deletedAt)
        )
      )
      .get()?.value;
    const sortOrder = (highest ?? -1) + 1;
    if (!Number.isSafeInteger(sortOrder))
      throw new OperationValidationError(
        'Attachment sort order exceeds the supported range.'
      );
    tx.insert(eventAttachments)
      .values({
        ...operation.payload,
        sortOrder,
        id: operation.entityId,
        deletedAt: null,
      })
      .run();
    return;
  }
  if (
    !tx
      .select({ id: eventAttachments.id })
      .from(eventAttachments)
      .where(eq(eventAttachments.id, operation.entityId))
      .get()
  )
    throw new OperationValidationError('Attachment to delete was not found.');
  tx.update(eventAttachments)
    .set({
      ...(winningFields.includes('deleted_at')
        ? { deletedAt: operation.payload.deletedAt }
        : {}),
      updatedAt: operation.payload.deletedAt,
    })
    .where(eq(eventAttachments.id, operation.entityId))
    .run();
}
