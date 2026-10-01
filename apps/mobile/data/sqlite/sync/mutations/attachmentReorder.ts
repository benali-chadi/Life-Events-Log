import { and, desc, eq, isNull } from 'drizzle-orm';
import type { SyncTransaction } from '../../database';
import { eventAttachments } from '../../schema';
import type { CreateOperationInput, SyncFieldName } from '../types';

/** Explicit positions converge; omitted attachments preserve device-local order. */
export function reorderAttachments(
  operation: Extract<
    CreateOperationInput,
    { operationType: 'event.attachment.reorder' }
  >,
  winningFields: readonly SyncFieldName[],
  tx: SyncTransaction
): void {
  if (!winningFields.includes('attachment_order')) return;
  const attachments = tx
    .select()
    .from(eventAttachments)
    .where(eq(eventAttachments.eventId, operation.entityId))
    .orderBy(
      eventAttachments.sortOrder,
      desc(eventAttachments.createdAt),
      eventAttachments.id
    )
    .all();
  const positions = new Map(
    operation.payload.orderedAttachmentIds.map((id, index) => [id, index])
  );
  const wins = winningFields.includes('attachment_order');
  let next = operation.payload.orderedAttachmentIds.length;
  for (const attachment of attachments) {
    const position = positions.get(attachment.id);
    if (attachment.deletedAt !== null) continue;
    const sortOrder = wins ? (position ?? next++) : attachment.sortOrder;
    // Only a winning reorder changes rows; omitted order is device-local.
    if (position === undefined && (!wins || attachment.sortOrder === sortOrder))
      continue;
    tx.update(eventAttachments)
      .set({
        ...(wins ? { sortOrder } : {}),
        updatedAt: operation.payload.updatedAt,
      })
      .where(
        and(
          eq(eventAttachments.id, attachment.id),
          isNull(eventAttachments.deletedAt)
        )
      )
      .run();
  }
}
