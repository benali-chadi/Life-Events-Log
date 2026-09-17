import { eq, sql } from 'drizzle-orm';
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
  if (operation.operationType === 'attachment.create') {
    tx.insert(eventAttachments)
      .values({ ...operation.payload, id: operation.entityId, deletedAt: null })
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
      updatedAt: sql`max(${eventAttachments.updatedAt}, ${operation.payload.deletedAt})`,
    })
    .where(eq(eventAttachments.id, operation.entityId))
    .run();
}
