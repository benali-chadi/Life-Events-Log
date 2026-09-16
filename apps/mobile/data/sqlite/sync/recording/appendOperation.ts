import { eq } from 'drizzle-orm';
import type { SyncTransaction } from '../../database';
import {
  syncFieldVersions,
  syncFrontiers,
  syncLocalState,
  syncOperations,
} from '../../schema';
import type { Operation, SyncFieldName, Timestamp } from '../types';

export type AppendOperationDependencies = { now: () => Timestamp };
const defaultDependencies: AppendOperationDependencies = {
  now: () => new Date().toISOString(),
};

/**
 * Records an already validated/applied operation and its winning fields.
 * The caller handles hash/dependency checks, arbitration, domain writes and
 * conflicts. Errors must propagate out of the caller's transaction to roll back
 * all changes. An empty winning-field list still advances the origin frontier.
 */
export function appendOperation(
  operation: Operation,
  tx: SyncTransaction,
  winningFieldNames: readonly SyncFieldName[],
  dependencies: AppendOperationDependencies = defaultDependencies
): void {
  const localState = tx.select().from(syncLocalState).get();
  if (!localState)
    throw new Error('Local sync state has not been initialized.');

  const frontier = tx
    .select()
    .from(syncFrontiers)
    .where(eq(syncFrontiers.originDeviceId, operation.originDeviceId))
    .get();
  const expectedSequence = (frontier?.processedSequence ?? 0) + 1;
  if (operation.originSequence !== expectedSequence) {
    throw new Error(
      `Expected ${operation.originDeviceId}:${expectedSequence}, received ${operation.originDeviceId}:${operation.originSequence}.`
    );
  }

  const timestamp = dependencies.now();
  tx.insert(syncOperations)
    .values({
      ...operation,
      // This might change later: received and applied timestamps might differ
      receivedAt: timestamp,
      appliedAt: timestamp,
    })
    .run();

  const winner = {
    winnerDeviceId: operation.originDeviceId,
    winnerSequence: operation.originSequence,
    winnerLamport: operation.lamport,
  };
  for (const fieldName of new Set(winningFieldNames)) {
    tx.insert(syncFieldVersions)
      .values({
        entityType: operation.entityType,
        entityId: operation.entityId,
        fieldName,
        ...winner,
      })
      .onConflictDoUpdate({
        target: [
          syncFieldVersions.entityType,
          syncFieldVersions.entityId,
          syncFieldVersions.fieldName,
        ],
        set: winner,
      })
      .run();
  }

  tx.insert(syncFrontiers)
    .values({
      originDeviceId: operation.originDeviceId,
      processedSequence: operation.originSequence,
    })
    .onConflictDoUpdate({
      target: syncFrontiers.originDeviceId,
      set: { processedSequence: operation.originSequence },
    })
    .run();

  tx.update(syncLocalState)
    .set({
      observedLamport: Math.max(localState.observedLamport, operation.lamport),
    })
    .where(eq(syncLocalState.deviceId, localState.deviceId))
    .run();
}
