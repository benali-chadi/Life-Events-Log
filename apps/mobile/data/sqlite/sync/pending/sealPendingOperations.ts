import { eq } from 'drizzle-orm';
import type { SyncTransaction } from '../../database';
import { eventAttachments, syncPendingOperations } from '../../schema';
import type { Operation, PendingOperation } from '../types';
import { validatePayload } from '../validation/validatePayload';
import { createOperation } from '../createOperation';
import {
  appendOperation,
  type AppendOperationDependencies,
} from '../recording/appendOperation';
import { winningFieldsFor } from '../entityFields';
import { refreshUpdatedAt } from '../mutations/refreshUpdatedAt';
import { orderPendingOperations } from './orderPendingOperations';

/** Seal already-applied local intent. The caller owns the transaction and must
 * let errors propagate: history, versions, timestamps and pending cleanup are atomic.
 * Must run before incorporating incoming history; never replays domain mutations.
 */
export function sealPendingOperations(
  tx: SyncTransaction,
  dependencies?: AppendOperationDependencies
): Operation[] {
  const pending = tx.select().from(syncPendingOperations).all();
  // Validate stored payloads before assigning permanent identities.
  for (const input of pending) validatePayload(input);
  const ordered = orderPendingOperations(pending as PendingOperation[]);
  const sealed: Operation[] = [];
  const refreshTargets = new Map<string, Operation>();
  const reorderedEvents = new Set<string>();
  for (const input of ordered) {
    const operation = createOperation(input, tx);
    appendOperation(operation, tx, winningFieldsFor(operation), dependencies);
    sealed.push(operation);
    const reorder = operation.operationType === 'event.attachment.reorder';
    if (reorder) reorderedEvents.add(operation.entityId);
    // Event fields and event-owned attachment order have different timestamp targets.
    refreshTargets.set(
      JSON.stringify([operation.entityType, operation.entityId, reorder]),
      operation
    );
  }
  // All winner pointers are final before any derived timestamps are recomputed.
  for (const operation of refreshTargets.values()) {
    if (operation.entityType === 'attachment' && reorderedEvents.size) {
      const row = tx
        .select({ eventId: eventAttachments.eventId })
        .from(eventAttachments)
        .where(eq(eventAttachments.id, operation.entityId))
        .get();
      // The reorder refresh visits all attachments, including tombstoned rows.
      if (row && reorderedEvents.has(row.eventId)) continue;
    }
    refreshUpdatedAt(operation, tx);
  }
  if (sealed.length) tx.delete(syncPendingOperations).run();
  return sealed;
}
