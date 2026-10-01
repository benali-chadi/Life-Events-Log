import type { SyncTransaction } from '../../database';
import { syncPendingOperations } from '../../schema';
import type { PendingOperation } from '../types';
import { getPending, hasHistory, pendingWhere, putPending } from './store';

export function compactPendingOperation(
  input: PendingOperation,
  tx: SyncTransaction
): void {
  if (input.operationType === 'entity.patch') {
    const creation = getPending(input, 'entity.create', tx);
    if (creation?.operationType === 'entity.create') {
      // Same entity/type slot: merging preserves the correlated payload shape.
      putPending(
        {
          ...creation,
          payload: {
            ...creation.payload,
            ...input.payload.changes,
            updatedAt: input.payload.updatedAt,
          },
        } as PendingOperation,
        tx
      );
      return;
    }
    const previous = getPending(input, 'entity.patch', tx);
    if (previous?.operationType === 'entity.patch') {
      putPending(
        {
          ...input,
          payload: {
            changes: { ...previous.payload.changes, ...input.payload.changes },
            updatedAt: input.payload.updatedAt,
          },
        } as PendingOperation,
        tx
      );
      return;
    }
  }
  if (
    input.operationType === 'relation.add' ||
    input.operationType === 'relation.remove'
  ) {
    const sealed = hasHistory(
      input.entityType,
      input.entityId,
      'relation.add',
      tx
    );
    if (input.operationType === 'relation.add' || sealed) {
      const opposite =
        input.operationType === 'relation.add'
          ? 'relation.remove'
          : 'relation.add';
      tx.delete(syncPendingOperations)
        .where(pendingWhere(input.entityType, input.entityId, opposite))
        .run();
    } else if (!getPending(input, 'relation.add', tx)) {
      throw new Error(
        'Pending relation removal requires a preceding addition.'
      );
    }
  }
  putPending(input, tx);
}
