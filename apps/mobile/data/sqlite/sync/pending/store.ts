import { and, eq } from 'drizzle-orm';
import type { SyncTransaction } from '../../database';
import { syncPendingOperations, syncOperations } from '../../schema';
import type { PendingOperation, OperationType, SyncEntityType } from '../types';

export function pendingWhere(
  entityType: SyncEntityType,
  entityId: string,
  operationType?: OperationType
) {
  return and(
    eq(syncPendingOperations.entityType, entityType),
    eq(syncPendingOperations.entityId, entityId),
    operationType
      ? eq(syncPendingOperations.operationType, operationType)
      : undefined
  );
}

export function putPending(input: PendingOperation, tx: SyncTransaction): void {
  tx.insert(syncPendingOperations)
    .values(input)
    .onConflictDoUpdate({
      target: [
        syncPendingOperations.entityId,
        syncPendingOperations.entityType,
        syncPendingOperations.operationType,
      ],
      set: { payload: input.payload },
    })
    .run();
}

export function getPending(
  input: Pick<PendingOperation, 'entityType' | 'entityId'>,
  type: OperationType,
  tx: SyncTransaction
): PendingOperation | undefined {
  return tx
    .select()
    .from(syncPendingOperations)
    .where(pendingWhere(input.entityType, input.entityId, type))
    .get() as PendingOperation | undefined;
}

export function hasHistory(
  entityType: SyncEntityType,
  entityId: string,
  operationType: OperationType,
  tx: SyncTransaction
): boolean {
  return !!tx
    .select({ sequence: syncOperations.originSequence })
    .from(syncOperations)
    .where(
      and(
        eq(syncOperations.entityType, entityType),
        eq(syncOperations.entityId, entityId),
        eq(syncOperations.operationType, operationType)
      )
    )
    .limit(1)
    .get();
}
