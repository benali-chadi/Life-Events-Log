import { and, eq } from 'drizzle-orm';
import type { SyncTransaction } from '../../database';
import {
  events,
  categories,
  tags,
  people,
  locations,
  eventAttachments,
  syncFieldVersions,
  syncOperations,
} from '../../schema';
import type { Operation, SyncEntityType } from '../types';
import { relationTarget } from '../resolution/relations';
import { OperationValidationError } from '../validation/OperationValidationError';

function winnerTimes(
  entityType: SyncEntityType,
  entityId: string,
  tx: SyncTransaction,
  orderOnly = false
): string[] {
  const versions = tx
    .select()
    .from(syncFieldVersions)
    .where(
      and(
        eq(syncFieldVersions.entityType, entityType),
        eq(syncFieldVersions.entityId, entityId)
      )
    )
    .all()
    .filter((version) =>
      orderOnly
        ? version.fieldName === 'attachment_order'
        : version.fieldName !== 'attachment_order'
    );
  const seen = new Set<string>();
  return versions.flatMap((version) => {
    const key = JSON.stringify([
      version.winnerDeviceId,
      version.winnerSequence,
    ]);
    if (seen.has(key)) return [];
    seen.add(key);
    const winner = tx
      .select()
      .from(syncOperations)
      .where(
        and(
          eq(syncOperations.originDeviceId, version.winnerDeviceId),
          eq(syncOperations.originSequence, version.winnerSequence)
        )
      )
      .get();
    if (!winner)
      throw new OperationValidationError(
        'Timestamp winner points to missing history.'
      );
    return [
      'deletedAt' in winner.payload
        ? winner.payload.deletedAt
        : winner.payload.updatedAt,
    ];
  });
}

function latest(baseline: string, timestamps: string[]): string {
  return timestamps.reduce(
    (value, timestamp) => (timestamp > value ? timestamp : value),
    baseline
  );
}

function refreshAttachment(id: string, tx: SyncTransaction): void {
  const row = tx
    .select()
    .from(eventAttachments)
    .where(eq(eventAttachments.id, id))
    .get();
  if (!row)
    throw new OperationValidationError(
      'Attachment timestamp target was not found.'
    );
  const timestamps = winnerTimes('attachment', id, tx);
  // Ordering belongs to attachments, never to the parent event. Deleted rows
  // no longer participate in the active order.
  if (row.deletedAt === null)
    timestamps.push(...winnerTimes('event', row.eventId, tx, true));
  const updatedAt = latest(row.createdAt, timestamps);
  if (updatedAt === row.updatedAt) return;
  tx.update(eventAttachments)
    .set({ updatedAt })
    .where(eq(eventAttachments.id, id))
    .run();
}

/** Recompute after appendOperation has installed the new field winners.
 */
export function refreshUpdatedAt(
  operation: Operation,
  tx: SyncTransaction
): void {
  switch (operation.operationType) {
    case 'entity.create':
    case 'entity.patch':
    case 'entity.delete': {
      const table = {
        event: events,
        category: categories,
        tag: tags,
        person: people,
        location: locations,
      }[operation.entityType];
      const row = tx
        .select()
        .from(table)
        .where(eq(table.id, operation.entityId))
        .get();
      if (!row)
        throw new OperationValidationError(
          'Entity timestamp target was not found.'
        );
      const updatedAt = latest(
        row.createdAt,
        winnerTimes(operation.entityType, operation.entityId, tx)
      );
      if (updatedAt === row.updatedAt) return;
      tx.update(table)
        .set({ updatedAt })
        .where(eq(table.id, operation.entityId))
        .run();
      return;
    }
    case 'relation.add':
    case 'relation.remove': {
      const { table, where } = relationTarget(operation);
      const row = tx.select().from(table).where(where).get();
      if (!row)
        throw new OperationValidationError(
          'Relation timestamp target was not found.'
        );
      const updatedAt = latest(
        row.createdAt,
        winnerTimes(operation.entityType, operation.entityId, tx)
      );
      if (updatedAt === row.updatedAt) return;
      tx.update(table).set({ updatedAt }).where(where).run();
      return;
    }
    case 'attachment.create':
    case 'attachment.delete':
      return refreshAttachment(operation.entityId, tx);
    case 'event.attachment.reorder':
      for (const row of tx
        .select({ id: eventAttachments.id })
        .from(eventAttachments)
        .where(eq(eventAttachments.eventId, operation.entityId))
        .all())
        refreshAttachment(row.id, tx);
  }
}
